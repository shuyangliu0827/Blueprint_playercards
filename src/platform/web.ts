import type { MaterialInput } from '../render/material-input';
export function assetUrl(ref: string): string {
  if (ref.startsWith('/') || ref.includes('..') || ref.includes(':') || ref.includes('\\'))
    throw new Error('Invalid local asset reference');
  return `/assets/${ref}`;
}
export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片加载失败，请重试'));
    image.src = url;
  });
}
export function bindPointer(
  element: HTMLElement,
  onInput: (v: MaterialInput) => void,
  onRest: () => void,
) {
  const move = (e: PointerEvent) => {
    const r = element.getBoundingClientRect();
    onInput({
      source: 'pointer',
      x: Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1)),
      y: Math.max(-1, Math.min(1, 1 - ((e.clientY - r.top) / r.height) * 2)),
    });
  };
  element.addEventListener('pointermove', move);
  element.addEventListener('pointerleave', onRest);
  element.addEventListener('pointerup', onRest);
  return () => {
    element.removeEventListener('pointermove', move);
    element.removeEventListener('pointerleave', onRest);
    element.removeEventListener('pointerup', onRest);
  };
}
export async function bindOrientation(onInput: (v: MaterialInput) => void): Promise<() => void> {
  const C = DeviceOrientationEvent as typeof DeviceOrientationEvent & {
    requestPermission?: () => Promise<string>;
  };
  if (C.requestPermission && (await C.requestPermission()) !== 'granted')
    throw new Error('未开启倾斜感应，仍可拖动卡片');
  let neutral: { beta: number; gamma: number } | undefined;
  const listen = (e: DeviceOrientationEvent) => {
    if (e.beta === null || e.gamma === null) return;
    neutral ??= { beta: e.beta, gamma: e.gamma };
    const angle = ((screen.orientation?.angle ?? 0) * Math.PI) / 180;
    const x = e.gamma - neutral.gamma,
      y = neutral.beta - e.beta;
    onInput({
      source: 'orientation',
      rollDeg: x * Math.cos(angle) - y * Math.sin(angle),
      pitchDeg: x * Math.sin(angle) + y * Math.cos(angle),
    });
  };
  window.addEventListener('deviceorientation', listen);
  return () => window.removeEventListener('deviceorientation', listen);
}
export function isWeChat() {
  return /MicroMessenger/i.test(navigator.userAgent);
}
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
