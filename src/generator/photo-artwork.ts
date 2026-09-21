import type { DetectedPerson, PreparedPhoto } from '../platform/photo';

/** Local photo composition only. Retains the photographed body, pose and orientation. */
export function composePhotoArtwork(photo: PreparedPhoto, subject: DetectedPerson): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 1380;
  canvas.height = 1485;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('浏览器无法创建预览画布。');
  ctx.fillStyle = '#0b1015';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Pad the complete detected body; contain it rather than cutting off hands or shoes.
  const x = Math.max(0, subject.x - subject.w * 0.3);
  const y = Math.max(0, subject.y - subject.h * 0.2);
  const right = Math.min(1, subject.x + subject.w * 1.3);
  const bottom = Math.min(1, subject.y + subject.h * 1.2);
  const sx = x * photo.metadata.width, sy = y * photo.metadata.height;
  const sw = (right - x) * photo.metadata.width, sh = (bottom - y) * photo.metadata.height;
  const scale = Math.min(canvas.width / sw, canvas.height / sh);
  const w = sw * scale, h = sh * scale;
  ctx.drawImage(photo.image, sx, sy, sw, sh, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
  return canvas;
}
