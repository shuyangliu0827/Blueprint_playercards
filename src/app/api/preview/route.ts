import { NextRequest, NextResponse } from 'next/server';
import { PreviewError } from '../../../server/preview-service';
import { previewService as service, ownSession } from '../../../server/preview-runtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const MAX_BODY_BYTES = 20 * 1024;
const COOKIE = 'bp_anon';

function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new PreviewError('BAD_REQUEST', 'request body must be an object');
  const result = value as Record<string, unknown>;
  for (const key of Object.keys(result))
    if (!keys.includes(key)) throw new PreviewError('BAD_REQUEST', `unexpected field ${key}`);
  return result;
}
function response(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  try {
    const contentLength = Number(request.headers.get('content-length') ?? 0);
    if (contentLength > MAX_BODY_BYTES)
      throw new PreviewError('BODY_TOO_LARGE', 'request body exceeds 20 KB', 413);
    const text = await request.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES)
      throw new PreviewError('BODY_TOO_LARGE', 'request body exceeds 20 KB', 413);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new PreviewError('BAD_JSON', 'request body must be JSON');
    }
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed) ||
      typeof (parsed as { action?: unknown }).action !== 'string'
    )
      throw new PreviewError('BAD_REQUEST', 'action is required');
    const action = (parsed as { action: string }).action;
    if (action === 'session') {
      const body = record(parsed, ['action', 'ref']);
      if (body.ref !== undefined && typeof body.ref !== 'string')
        throw new PreviewError('BAD_REQUEST', 'ref must be a string');
      const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
      const result = service().createSession(
        request.cookies.get(COOKIE)?.value,
        body.ref as string | undefined,
        forwarded,
      );
      const out = response(result.value);
      out.cookies.set(COOKIE, result.cookie, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
      });
      return out;
    }
    const anonId = ownSession(request);
    if (action === 'submit') {
      const b = record(parsed, ['action', 'requestId', 'input', 'mode', 'scenario', 'reason']);
      return response(service().submit(anonId, b as never));
    }
    if (action === 'poll') {
      const b = record(parsed, ['action', 'requestId']);
      if (typeof b.requestId !== 'string')
        throw new PreviewError('BAD_REQUEST', 'requestId must be a string');
      return response(service().poll(anonId, b.requestId));
    }
    if (action === 'complete') {
      const b = record(parsed, ['action', 'requestId']);
      if (typeof b.requestId !== 'string')
        throw new PreviewError('BAD_REQUEST', 'requestId must be a string');
      return response(service().complete(anonId, b.requestId));
    }
    if (action === 'restore') {
      const b = record(parsed, ['action', 'requestId']);
      if (typeof b.requestId !== 'string')
        throw new PreviewError('BAD_REQUEST', 'requestId must be a string');
      return response(service().restore(anonId, b.requestId));
    }
    if (action === 'render-failed') {
      const b = record(parsed, ['action', 'requestId']);
      if (typeof b.requestId !== 'string')
        throw new PreviewError('BAD_REQUEST', 'requestId must be a string');
      return response(service().renderFailed(anonId, b.requestId));
    }
    if (action === 'events') {
      const b = record(parsed, ['action', 'events']);
      if (!Array.isArray(b.events) || b.events.length > 100)
        throw new PreviewError('BAD_REQUEST', 'events must be an array of at most 100');
      return response({ accepted: service().acceptEvents(anonId, b.events) });
    }
    if (action === 'metrics') {
      record(parsed, ['action']);
      return response(service().metrics(anonId));
    }
    throw new PreviewError('UNKNOWN_ACTION', 'unknown action');
  } catch (error) {
    const known =
      error instanceof PreviewError
        ? error
        : new PreviewError(
            'INTERNAL_ERROR',
            error instanceof Error ? error.message : 'internal error',
            500,
          );
    return response({ error: known.code, message: known.message }, known.status);
  }
}
