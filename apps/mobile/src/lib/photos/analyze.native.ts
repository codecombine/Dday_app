// 안드로이드: 사진 한 장의 지문(SHA-256·pHash)·크기·EXIF를 계산하고 미리보기·썸네일을 만든다.
// 파일 바이트는 expo-file-system, 해시는 expo-crypto, 줄이기는 expo-image-manipulator, PNG 해독은 upng-js.
import { grayscale32, guessSource, phashFromGray32 } from '@hanjibung/core';
import * as Crypto from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat, type ImageRef } from 'expo-image-manipulator';
import * as UPNG from 'upng-js';

import { summarizeExif } from './exif';
import type { AnalyzedPhoto, LocalPhoto, Quality, Variant } from './types';

const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');

function base64ToBytes(b64: string): Uint8Array {
  const bin = globalThis.atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function fit(w: number, h: number, longSide: number): { width: number; height: number } | null {
  if (Math.max(w, h) <= longSide) return null;
  const s = longSide / Math.max(w, h);
  return { width: Math.max(1, Math.round(w * s)), height: Math.max(1, Math.round(h * s)) };
}

/** 긴 변 longSide JPEG로 저장 (원본이 더 작으면 크기는 그대로, 다시 압축만) */
async function jpeg(src: string | ImageRef, w: number, h: number, longSide: number, compress: number): Promise<{ variant: Variant; ref: ImageRef; uri: string }> {
  const ctx = ImageManipulator.manipulate(src);
  const size = fit(w, h, longSide);
  if (size) ctx.resize(size);
  const ref = await ctx.renderAsync();
  const saved = await ref.saveAsync({ format: SaveFormat.JPEG, compress });
  const bytes = new File(saved.uri).size ?? 0;
  return { variant: { data: saved.uri, contentType: 'image/jpeg', bytes }, ref, uri: saved.uri };
}

/** 32×32 흑백 → pHash. 썸네일에서 줄여 계단 현상을 줄인다 */
async function phashOf(thumb: ImageRef): Promise<string> {
  const ctx = ImageManipulator.manipulate(thumb);
  ctx.resize({ width: 32, height: 32 });
  const ref = await ctx.renderAsync();
  const png = await ref.saveAsync({ format: SaveFormat.PNG, base64: true });
  try {
    const img = UPNG.decode(base64ToBytes(png.base64 ?? '').buffer as ArrayBuffer);
    const rgba = new Uint8Array(UPNG.toRGBA8(img)[0]!);
    return phashFromGray32(grayscale32(rgba, 4));
  } finally {
    cleanupTemp([png.uri]);
  }
}

export async function analyzePhoto(local: LocalPhoto, quality: Quality): Promise<AnalyzedPhoto> {
  const file = new File(local.uri);
  const bytes = await file.bytes();
  const sha = hex(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes));
  const exif = summarizeExif(local.exif);
  const fileBytes = local.bytes || bytes.byteLength;

  // 원본을 한 번 읽어 크기를 알아낸다 (사진첩이 0을 줄 때가 있다)
  const base = await ImageManipulator.manipulate(local.uri).renderAsync();
  const w = base.width || local.width;
  const h = base.height || local.height;
  const temp: string[] = [];
  try {
    const thumb = await jpeg(base, w, h, 400, 0.8);
    temp.push(thumb.uri);
    const phash = await phashOf(thumb.ref);
    const preview = await jpeg(base, w, h, 1600, 0.85);
    temp.push(preview.uri);
    let original: Variant = { data: local.uri, contentType: local.mime || 'image/jpeg', bytes: fileBytes };
    if (quality === 'original' && !local.uri.startsWith('file://')) {
      // content:// 주소는 업로드(fetch)가 못 읽을 수 있어 이미 읽은 바이트를 캐시 파일로 옮겨 둔다
      const ext = local.name.split('.').pop()?.toLowerCase() || 'jpg';
      const copy = new File(Paths.cache, `upload-${Crypto.randomUUID()}.${ext}`);
      copy.create({ overwrite: true });
      copy.write(bytes);
      temp.push(copy.uri);
      original = { ...original, data: copy.uri };
    }
    let [ow, oh] = [w, h];
    if (quality === 'saver') {
      const saved = await jpeg(base, w, h, 2048, 0.85);
      temp.push(saved.uri);
      original = saved.variant;
      [ow, oh] = [saved.ref.width, saved.ref.height];
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
      preview: preview.variant,
      thumb: thumb.variant,
      temp,
    };
  } catch (e) {
    cleanupTemp(temp);
    throw e;
  }
}

/** 화면 표시용 찍은 날짜 (고를 때 받은 EXIF에서) */
export async function readTakenAt(local: LocalPhoto): Promise<number | null> {
  return summarizeExif(local.exif).takenAt;
}

/** 올리기가 끝난 임시 파일 지우기 (실패해도 캐시 폴더라 괜찮다) */
export function cleanupTemp(paths: string[]): void {
  for (const p of paths) {
    try {
      const f = new File(p);
      if (f.exists) f.delete();
    } catch {
      // 무시
    }
  }
}
