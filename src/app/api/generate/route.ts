import { NextRequest, NextResponse } from 'next/server';
import { ImageGenerationService, IMAGE_MODEL, MAX_UPLOAD_BYTES, parseGenerationForm } from '../../../server/image-generation';
import { ownSession, previewService } from '../../../server/preview-runtime';
import { PreviewError } from '../../../server/preview-service';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
declare global { var __basketballImageService: ImageGenerationService | undefined; }
function service() { return globalThis.__basketballImageService ??= new ImageGenerationService(previewService(), { apiKey: process.env.OPENAI_API_KEY }); }
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export async function GET() { return json({ configured: Boolean(process.env.OPENAI_API_KEY?.trim()), model: IMAGE_MODEL }); }
export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get('origin');
    if (origin && origin !== request.nextUrl.origin) throw new PreviewError('ORIGIN_REJECTED', 'cross-origin generation is not allowed', 403);
    const actor = ownSession(request);
    if (!service().status.configured) throw new PreviewError('PROVIDER_NOT_CONFIGURED', '尚未配置 OpenAI API Key，请联系管理员。', 503);
    if (!request.headers.get('content-type')?.startsWith('multipart/form-data;')) throw new PreviewError('BAD_REQUEST', 'multipart/form-data is required');
    if (Number(request.headers.get('content-length')) > MAX_UPLOAD_BYTES) throw new PreviewError('BODY_TOO_LARGE', 'upload exceeds 30 MB', 413);
    const reader = request.body?.getReader();
    if (!reader) throw new PreviewError('BAD_REQUEST', 'upload is missing');
    const chunks: Uint8Array[] = []; let total = 0;
    for (;;) {
      const part = await reader.read(); if (part.done) break;
      total += part.value.length;
      if (total > MAX_UPLOAD_BYTES) { await reader.cancel(); throw new PreviewError('BODY_TOO_LARGE', 'upload exceeds 30 MB', 413); }
      chunks.push(part.value);
    }
    let form: FormData;
    try { form = await new Response(Buffer.concat(chunks), { headers: { 'Content-Type': request.headers.get('content-type')! } }).formData(); }
    catch { throw new PreviewError('BAD_REQUEST', 'invalid multipart upload'); }
    return json(await service().generate(actor, parseGenerationForm(form)));
  } catch (error) {
    const known = error instanceof PreviewError ? error : new PreviewError('GENERATION_FAILED', '图片生成失败，请稍后重试。', 500);
    return json({ error: known.code, message: known.message }, known.status);
  }
}
