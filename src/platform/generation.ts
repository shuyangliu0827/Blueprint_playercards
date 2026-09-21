import type { CardInput } from '../core/input';
import type { JobView } from '../server/preview-service';
import type { PreparedPhoto, DetectedPerson } from './photo';
import { ApiError } from './api';

export type ArtworkResult = { artwork: string; job: JobView };
export type GenerationStatus = { configured: boolean; model: string };
export async function generationStatus(): Promise<GenerationStatus> {
  const response = await fetch('/api/generate', { cache: 'no-store' });
  if (!response.ok) throw new Error('暂时无法检查图像服务连接。');
  return response.json();
}
export async function encodeGenerationPhoto(photo: PreparedPhoto) {
  const scale = Math.min(1, 2048 / Math.max(photo.metadata.width, photo.metadata.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(photo.metadata.width * scale));
  canvas.height = Math.max(1, Math.round(photo.metadata.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法准备照片，请重新打开页面。');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(photo.image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('照片转换失败。'))),
      'image/jpeg',
      0.94,
    ),
  );
  return {
    blob,
    metadata: {
      mimeType: 'image/jpeg' as const,
      byteSize: blob.size,
      width: canvas.width,
      height: canvas.height,
    },
  };
}
export async function generationPayload(
  requestId: string,
  input: CardInput,
  series: string,
  subject: DetectedPerson,
  photos: PreparedPhoto[],
) {
  if (photos.length < 1 || photos.length > 3) throw new Error('请上传 1–3 张照片。');
  const encoded = await Promise.all(photos.map(encodeGenerationPhoto));
  const normalized = { ...input, photo: encoded[0]!.metadata };
  const form = new FormData();
  form.set('requestId', requestId);
  form.set('input', JSON.stringify(normalized));
  form.set('series', series);
  form.set('subject', JSON.stringify(subject));
  encoded.forEach((p, i) => form.append('photos', p.blob, `reference-${i + 1}.jpg`));
  return form;
}
export async function requestArtwork(form: FormData): Promise<ArtworkResult> {
  let response: Response;
  try {
    response = await fetch('/api/generate', {
      method: 'POST',
      body: form,
      credentials: 'same-origin',
      cache: 'no-store',
      signal: AbortSignal.timeout(290_000),
    });
  } catch {
    throw new ApiError(
      'CONNECTION_INTERRUPTED',
      '连接中断，生成可能仍在继续。点击「查询本次结果」会使用同一任务，不会自动重开生成。',
    );
  }
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new ApiError(
      data?.error ?? 'GENERATION_FAILED',
      data?.message ?? '图像服务暂时不可用，请稍后重试。',
    );
  if (
    typeof data?.artwork !== 'string' ||
    !/^data:image\/(png|jpeg|webp);base64,/.test(data.artwork) ||
    !data?.job?.requestId
  ) {
    throw new Error('图像服务未返回有效的卡面，请查询本次结果。');
  }
  return data;
}
