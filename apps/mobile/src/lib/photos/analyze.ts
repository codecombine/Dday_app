// 웹: 사진 한 장의 지문(SHA-256·pHash)·크기·EXIF를 계산하고 미리보기·썸네일을 만든다.
// 네이티브 구현은 analyze.native.ts
import { grayscale32, guessSource, phashFromGray32 } from '@hanjibung/core';
import exifr from 'exifr';

import { summarizeExif } from './exif';
import type { AnalyzedPhoto, LocalPhoto, Quality, Variant } from './types';

const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');

async function sha256(blob: Blob): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()));
}

async function decode(blob: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('이 형식의 사진은 웹에서 올릴 수 없어요');
  }
}

function canvasOf(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function fit(w: number, h: number, longSide: number): [number, number] {
  const s = Math.min(1, longSide / Math.max(w, h));
  return [Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s))];
}

/** 긴 변 longSide로 줄인 캔버스 (원본이 더 작으면 그대로) */
function resized(src: CanvasImageSource, w: number, h: number, longSide: number): HTMLCanvasElement {
  const [tw, th] = fit(w, h, longSide);
  const c = canvasOf(tw, th);
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, tw, th);
  return c;
}

function toJpeg(c: HTMLCanvasElement, quality: number): Promise<Variant> {
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve({ data: b, contentType: 'image/jpeg', bytes: b.size }) : reject(new Error('이미지를 만들지 못했어요'))), 'image/jpeg', quality),
  );
}

/** 32×32 흑백 → pHash (썸네일에서 줄여 계단 현상을 줄인다) */
function phashOf(src: HTMLCanvasElement): string {
  const c = canvasOf(32, 32);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, 32, 32);
  return phashFromGray32(grayscale32(ctx.getImageData(0, 0, 32, 32).data, 4));
}

async function readExif(blob: Blob) {
  try {
    const raw = await exifr.parse(blob, { pick: ['DateTimeOriginal', 'CreateDate', 'OffsetTimeOriginal', 'Make', 'Model'], reviveValues: false });
    return summarizeExif(raw ?? null);
  } catch {
    return summarizeExif(null);
  }
}

export async function analyzePhoto(local: LocalPhoto, quality: Quality): Promise<AnalyzedPhoto> {
  const file = local.file ?? (await (await fetch(local.uri)).blob());
  const [sha, exif, bitmap] = await Promise.all([sha256(file), readExif(file), decode(file)]);
  try {
    const w = bitmap.width;
    const h = bitmap.height;
    const thumbCanvas = resized(bitmap, w, h, 400);
    const phash = phashOf(thumbCanvas);
    const thumb = await toJpeg(thumbCanvas, 0.8);
    const preview = await toJpeg(resized(bitmap, w, h, 1600), 0.85);
    let original: Variant = { data: file, contentType: local.mime || file.type || 'image/jpeg', bytes: file.size };
    let [ow, oh] = [w, h];
    if (quality === 'saver') {
      const c = resized(bitmap, w, h, 2048);
      original = await toJpeg(c, 0.85);
      [ow, oh] = [c.width, c.height];
    }
    return {
      local,
      // 파일 지문은 고른 파일 기준(같은 파일을 다시 올리지 않도록), 크기·용량은 보관하는 원본 기준
      input: {
        sha256: sha,
        phash,
        width: ow,
        height: oh,
        bytes: original.bytes,
        mime: original.contentType,
        hasExif: exif.hasExif,
        takenAt: exif.takenAt,
        cameraModel: exif.cameraModel,
        source: guessSource(local.name, exif.hasExif),
        originalName: local.name,
      },
      original,
      preview,
      thumb,
      temp: [],
    };
  } finally {
    bitmap.close();
  }
}

/** 화면 표시용 찍은 날짜 (올리기 전에 빨리) */
export async function readTakenAt(local: LocalPhoto): Promise<number | null> {
  if (!local.file) return null;
  return (await readExif(local.file)).takenAt;
}

/** 웹은 임시 파일이 없다 */
export function cleanupTemp(_paths: string[]): void {}
