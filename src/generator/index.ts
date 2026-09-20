import type { DrawResult } from '../core/draw';
import type { DetectedFace, PreparedPhoto } from '../platform/photo';

export interface GeneratorInput {
  readonly photo: PreparedPhoto;
  readonly face: DetectedFace;
}
export interface Artwork {
  readonly canvas: HTMLCanvasElement;
  readonly width: number;
  readonly height: number;
  readonly kind: 'mock';
  readonly debug: { readonly poseId: string; readonly mirror: boolean };
}

export interface Generator {
  generate(
    input: GeneratorInput,
    templateVersion: string,
    poseId: string,
    mirror: boolean,
    drawResult: DrawResult,
  ): Promise<Artwork>;
}

export interface ArtworkEvaluator {
  evaluate(artwork: Artwork): Promise<'pending-manual'>;
}

export class ManualArtworkEvaluator implements ArtworkEvaluator {
  async evaluate(_artwork: Artwork): Promise<'pending-manual'> {
    return 'pending-manual';
  }
}

const WIDTH = 1380;
const HEIGHT = 1485;

function poseDirection(poseId: string): number {
  if (poseId.endsWith('-L')) return -1;
  if (poseId.endsWith('-R')) return 1;
  return 0;
}

function groupScale(poseId: string): number {
  if (poseId.startsWith('G-')) return 0.9;
  if (poseId.startsWith('C-')) return 1.12;
  return 1;
}

export class MockGenerator implements Generator {
  async generate(
    input: GeneratorInput,
    _templateVersion: string,
    poseId: string,
    mirror: boolean,
    _drawResult: DrawResult,
  ): Promise<Artwork> {
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('浏览器无法创建预览画布。');

    ctx.fillStyle = '#071a3b';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    const direction = poseDirection(poseId) * (mirror ? -1 : 1);
    const scale = groupScale(poseId);
    const centerX = WIDTH / 2 + direction * 115;
    const shoulderY = 535;

    ctx.save();
    ctx.translate(centerX, shoulderY);
    ctx.scale(mirror ? -scale : scale, scale);
    ctx.fillStyle = '#2364aa';
    ctx.strokeStyle = '#75baff';
    ctx.lineWidth = 24;
    ctx.beginPath();
    ctx.moveTo(-260, 25);
    ctx.quadraticCurveTo(-355, 110, -315, 670);
    ctx.lineTo(315, 670);
    ctx.quadraticCurveTo(355, 110, 260, 25);
    ctx.quadraticCurveTo(120, -50, 0, 20);
    ctx.quadraticCurveTo(-120, -50, -260, 25);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#dcecff';
    ctx.lineWidth = 105;
    ctx.beginPath();
    ctx.moveTo(-245, 120);
    ctx.lineTo(-445 - direction * 65, 575);
    ctx.moveTo(245, 120);
    ctx.lineTo(430 + direction * 120, 465);
    ctx.stroke();
    ctx.restore();

    const ballX = centerX + (430 + direction * 120) * scale * (mirror ? -1 : 1);
    const ballY = shoulderY + 465 * scale;
    ctx.fillStyle = '#da661f';
    ctx.strokeStyle = '#2b180d';
    ctx.lineWidth = 15;
    ctx.beginPath();
    ctx.arc(ballX, ballY, 125, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ballX - 115, ballY);
    ctx.lineTo(ballX + 115, ballY);
    ctx.moveTo(ballX, ballY - 115);
    ctx.quadraticCurveTo(ballX + 58, ballY, ballX, ballY + 115);
    ctx.stroke();

    const { face, photo } = input;
    const margin = 0.28;
    let sx = Math.max(0, (face.x - face.w * margin) * photo.metadata.width);
    let sy = Math.max(0, (face.y - face.h * margin) * photo.metadata.height);
    let sw = Math.min(photo.metadata.width - sx, face.w * (1 + margin * 2) * photo.metadata.width);
    let sh = Math.min(
      photo.metadata.height - sy,
      face.h * (1 + margin * 2) * photo.metadata.height,
    );
    const headW = 390 * scale;
    const headH = 455 * scale;
    const targetAspect = headW / headH;
    const sourceAspect = sw / sh;
    if (sourceAspect > targetAspect) {
      const coveredWidth = sh * targetAspect;
      sx += (sw - coveredWidth) / 2;
      sw = coveredWidth;
    } else {
      const coveredHeight = sw / targetAspect;
      sy += (sh - coveredHeight) / 2;
      sh = coveredHeight;
    }
    const headX = centerX - headW / 2;
    const headY = shoulderY - headH + 70;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(centerX, headY + headH / 2, headW / 2, headH / 2, 0, 0, Math.PI * 2);
    ctx.clip();
    // The face stays unmirrored to preserve identity; only the body pose mirrors.
    ctx.drawImage(photo.image, sx, sy, sw, sh, headX, headY, headW, headH);
    ctx.restore();

    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.font = '600 28px sans-serif';
    ctx.fillText(`MOCK · ${poseId} · mirror:${mirror}`, 44, 75);
    return { canvas, width: WIDTH, height: HEIGHT, kind: 'mock', debug: { poseId, mirror } };
  }
}

export class RealGenerator implements Generator {
  async generate(
    _input: GeneratorInput,
    _templateVersion: string,
    _poseId: string,
    _mirror: boolean,
    _drawResult: DrawResult,
  ): Promise<Artwork> {
    const error = new Error('真实生成器尚未配置。') as Error & { code: string };
    error.code = 'NOT_CONFIGURED';
    throw error;
  }
}
