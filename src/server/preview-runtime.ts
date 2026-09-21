import 'server-only';
import { join } from 'node:path';
import type { NextRequest } from 'next/server';
import { PreviewError, PreviewService, verifyAnonCookie } from './preview-service';
declare global { var __basketballPreviewService: PreviewService | undefined; }
export function previewService(): PreviewService {
  return globalThis.__basketballPreviewService ??= new PreviewService({
    configDirectory: join(process.cwd(), 'config'),
    drawSecret: process.env.DRAW_HMAC_SECRET ?? '',
    ipHashSalt: process.env.IP_HASH_SALT ?? '',
  });
}
export function ownSession(request: NextRequest): string {
  const cookie = request.cookies.get('bp_anon')?.value;
  const id = verifyAnonCookie(cookie, process.env.DRAW_HMAC_SECRET ?? '');
  if (!id) throw new PreviewError('SESSION_REQUIRED', 'start a signed session first', 401);
  previewService().createSession(cookie, undefined, request.headers.get('x-forwarded-for')?.split(',')[0]?.trim());
  return id;
}
