export interface PreparedPhoto {
  readonly image: HTMLImageElement;
  readonly objectUrl: string;
  readonly metadata: {
    readonly mimeType: string;
    readonly byteSize: number;
    readonly width: number;
    readonly height: number;
  };
}

export type FaceAngle = 'F' | 'L' | 'R' | 'UNCERTAIN';

export interface DetectedFace {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly angle: FaceAngle;
  readonly confidence: number;
}

export interface FaceKeypoint {
  readonly x: number;
  readonly y: number;
  readonly label?: string;
  readonly score?: number;
}

const MAX_PROCESSING_EDGE = 2048;
const inputConfig = validateInputConfig(inputConfigJson);
const ACCEPTED_MIME_TYPES = new Set<string>(inputConfig.allowedPhotoMimeTypes);

function isHeic(file: File): boolean {
  return file.type === 'image/heic' || file.type === 'image/heif' || /\.hei[cf]$/i.test(file.name);
}

function loadImage(objectUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('照片无法读取，请换一张 JPEG、PNG 或 HEIC 照片。'));
    image.src = objectUrl;
  });
}

export async function decodePhoto(file: File): Promise<PreparedPhoto> {
  if (!(file instanceof File)) throw new Error('请选择一张照片。');
  if (file.size > inputConfig.maxPhotoBytes) throw new Error('照片不能超过 10 MB。');
  if (file.size === 0) throw new Error('照片文件为空，请重新选择。');

  const originalMime = isHeic(file) ? 'image/heic' : file.type;
  if (!ACCEPTED_MIME_TYPES.has(originalMime)) {
    throw new Error('仅支持 JPEG、PNG 或 HEIC 照片。');
  }

  let decodedBlob: Blob = file;
  if (isHeic(file)) {
    try {
      const { default: heic2any } = await import('heic2any');
      const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
      decodedBlob = Array.isArray(converted) ? converted[0]! : converted;
    } catch {
      throw new Error('HEIC 照片转换失败，请换一张照片或先转为 JPEG。');
    }
  }

  const objectUrl = URL.createObjectURL(decodedBlob);
  try {
    const image = await loadImage(objectUrl);
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (!width || !height) throw new Error('照片尺寸无效，请换一张照片。');
    return {
      image,
      objectUrl,
      metadata: { mimeType: originalMime, byteSize: file.size, width, height },
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

export function releasePhoto(photo: PreparedPhoto): void {
  URL.revokeObjectURL(photo.objectUrl);
}

/** Warnings use original decoded dimensions, before the detector's working resize. */
export function getPhotoWarnings(photo: PreparedPhoto): string[] {
  return Math.min(photo.metadata.width, photo.metadata.height) < inputConfig.shortEdgeWarningPixels
    ? ['照片较小，成卡中的头像可能不够清晰。']
    : [];
}

/**
 * BlazeFace keypoint order is right eye, left eye, nose, mouth, right ear, left ear.
 * The nose displacement is measured relative to the eye midpoint and eye spacing.
 */
export function classifyFaceAngle(keypoints: readonly FaceKeypoint[]): FaceAngle {
  const rightEye = keypoints.find((point) => point.label === 'right eye') ?? keypoints[0];
  const leftEye = keypoints.find((point) => point.label === 'left eye') ?? keypoints[1];
  const nose = keypoints.find((point) => point.label === 'nose tip') ?? keypoints[2];
  if (!rightEye || !leftEye || !nose) return 'UNCERTAIN';
  if (![rightEye.x, rightEye.y, leftEye.x, leftEye.y, nose.x, nose.y].every(Number.isFinite))
    return 'UNCERTAIN';
  if ([rightEye, leftEye, nose].some((point) => point.score !== undefined && point.score < 0.4))
    return 'UNCERTAIN';

  const eyeDistance = Math.abs(leftEye.x - rightEye.x);
  if (eyeDistance < 0.015) return 'UNCERTAIN';
  const offset = (nose.x - (leftEye.x + rightEye.x) / 2) / eyeDistance;
  if (Math.abs(offset) < 0.16) return 'F';
  if (Math.abs(offset) > 0.7) return 'UNCERTAIN';
  return offset < 0 ? 'L' : 'R';
}

export interface PixelDetectionBox {
  readonly originX: number;
  readonly originY: number;
  readonly width: number;
  readonly height: number;
}

export function normalizeDetectionBox(
  box: PixelDetectionBox,
  sourceWidth: number,
  sourceHeight: number,
): Pick<DetectedFace, 'x' | 'y' | 'w' | 'h'> | undefined {
  if (
    ![box.originX, box.originY, box.width, box.height, sourceWidth, sourceHeight].every(
      Number.isFinite,
    )
  )
    return undefined;
  if (sourceWidth <= 0 || sourceHeight <= 0 || box.width <= 0 || box.height <= 0) return undefined;
  const x = Math.min(1, Math.max(0, box.originX / sourceWidth));
  const y = Math.min(1, Math.max(0, box.originY / sourceHeight));
  const right = Math.min(1, Math.max(0, (box.originX + box.width) / sourceWidth));
  const bottom = Math.min(1, Math.max(0, (box.originY + box.height) / sourceHeight));
  const w = right - x;
  const h = bottom - y;
  return w > 0 && h > 0 ? { x, y, w, h } : undefined;
}

let detectorPromise: Promise<import('@mediapipe/tasks-vision').FaceDetector> | undefined;

async function getDetector(): Promise<import('@mediapipe/tasks-vision').FaceDetector> {
  detectorPromise ??= (async () => {
    const { FaceDetector, FilesetResolver } = await import('@mediapipe/tasks-vision');
    const vision = await FilesetResolver.forVisionTasks('/wasm');
    return FaceDetector.createFromOptions(vision, {
      baseOptions: { modelAssetPath: '/models/face-detector.tflite', delegate: 'CPU' },
      runningMode: 'IMAGE',
      minDetectionConfidence: 0.4,
    });
  })();
  return detectorPromise;
}

export async function detectFaces(prepared: PreparedPhoto): Promise<DetectedFace[]> {
  const { image, metadata } = prepared;
  const scale = Math.min(1, MAX_PROCESSING_EDGE / Math.max(metadata.width, metadata.height));
  let source: CanvasImageSource = image;
  if (scale < 1) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(metadata.width * scale));
    canvas.height = Math.max(1, Math.round(metadata.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('浏览器无法处理这张照片。');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    source = canvas;
  }

  try {
    const detector = await getDetector();
    return detector.detect(source).detections.flatMap((detection) => {
      const box = detection.boundingBox;
      if (!box) return [];
      const sourceWidth = scale < 1 ? Math.round(metadata.width * scale) : metadata.width;
      const sourceHeight = scale < 1 ? Math.round(metadata.height * scale) : metadata.height;
      const normalizedBox = normalizeDetectionBox(box, sourceWidth, sourceHeight);
      if (!normalizedBox) return [];
      return [
        {
          ...normalizedBox,
          angle: classifyFaceAngle(detection.keypoints),
          confidence: detection.categories[0]?.score ?? 0,
        },
      ];
    });
  } catch (error) {
    detectorPromise = undefined;
    const detail = error instanceof Error ? error.message : '';
    throw new Error(`人脸识别暂时不可用，请稍后重试。${detail ? `（${detail}）` : ''}`);
  }
}
import inputConfigJson from '../../config/input_schema.json';
import { validateInputConfig } from '../core/input';
