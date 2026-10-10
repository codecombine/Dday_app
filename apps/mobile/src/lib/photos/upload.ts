// 사진 올리기 파이프라인 (명세서 8.2)
// 1) 사진마다 지문·미리보기·썸네일 계산 → 2) POST /photos/prepare (같은 파일 확인, 사진 ID 발급)
// 3) 새 사진은 썸네일·미리보기·원본 PUT → POST /photos/:id/commit
// 4) 이미 있는 사진은 물어본 뒤 POST /photos/:id/add 로 공유 범위·앨범만 더한다
import type { AddToExistingRequest, CommitPhotoRequest, PreparedPhoto, PreparePhotosRequest, PreparePhotosResponse, PhotoVariant } from '@hanjibung/core';

import type { Backend } from '@/lib/backend';

import { analyzePhoto, cleanupTemp } from './analyze';
import type { AnalyzedPhoto, LocalPhoto, Quality } from './types';
import { invalidatePhotoUrls } from './urls';

export const UPLOAD_CONCURRENCY = 2;
const PREPARE_BATCH = 50;

/** items를 n개씩 동시에 처리한다 */
export async function runPool<T>(items: T[], n: number, fn: (item: T, index: number) => Promise<void>, shouldStop?: () => boolean): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      if (shouldStop?.()) return;
      const i = next++;
      await fn(items[i]!, i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
}

export function errorText(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  return '알 수 없는 오류';
}

export interface AnalyzeResult {
  analyzed: AnalyzedPhoto[];
  failed: { local: LocalPhoto; error: string }[];
}

/** 지문 계산. 사진 하나가 실패해도 나머지는 계속 */
export async function analyzeAll(
  locals: LocalPhoto[],
  quality: Quality,
  onEach?: (local: LocalPhoto, ok: boolean, error?: string) => void,
  shouldStop?: () => boolean,
): Promise<AnalyzeResult> {
  const analyzed: (AnalyzedPhoto | undefined)[] = new Array(locals.length);
  const failed: AnalyzeResult['failed'] = [];
  await runPool(
    locals,
    UPLOAD_CONCURRENCY,
    async (local, i) => {
      try {
        analyzed[i] = await analyzePhoto(local, quality);
        onEach?.(local, true);
      } catch (e) {
        failed.push({ local, error: errorText(e) });
        onEach?.(local, false, errorText(e));
      }
    },
    shouldStop,
  );
  return { analyzed: analyzed.filter((a): a is AnalyzedPhoto => !!a), failed };
}

export interface Prepared {
  photo: AnalyzedPhoto;
  /** 새로 올릴 사진 ID */
  photoId: string | null;
  /** 볼 수 있는 사진 중 같은 파일 */
  existingPhotoId: string | null;
  /** 이번에 고른 사진 안에서 같은 파일이 이미 있음 (건너뜀) */
  duplicateInBatch: boolean;
}

export async function preparePhotos(backend: Backend, photos: AnalyzedPhoto[]): Promise<Prepared[]> {
  // 같은 파일을 두 번 고른 경우 첫 장만 서버에 묻는다
  const firstBySha = new Map<string, AnalyzedPhoto>();
  for (const p of photos) if (!firstBySha.has(p.input.sha256)) firstBySha.set(p.input.sha256, p);
  const unique = [...firstBySha.values()];
  const bySha = new Map<string, PreparedPhoto>();
  for (let i = 0; i < unique.length; i += PREPARE_BATCH) {
    const part = unique.slice(i, i + PREPARE_BATCH);
    const res = await backend.api<PreparePhotosResponse>('POST', '/photos/prepare', { photos: part.map((p) => p.input) } satisfies PreparePhotosRequest);
    for (const r of res.photos) bySha.set(r.sha256, r);
  }
  return photos.map((photo) => {
    const dup = firstBySha.get(photo.input.sha256) !== photo;
    const r = bySha.get(photo.input.sha256);
    return {
      photo,
      photoId: dup ? null : (r?.photoId ?? null),
      existingPhotoId: dup ? null : (r?.existingPhotoId ?? null),
      duplicateInBatch: dup,
    };
  });
}

export interface CommitOptions {
  spaceIds: string[];
  albumIds: string[];
  notify: boolean;
}

/** 썸네일 → 미리보기 → 원본 순서로 올리고 완료 처리 */
export async function uploadOne(backend: Backend, photoId: string, photo: AnalyzedPhoto, opts: CommitOptions): Promise<void> {
  const order: [PhotoVariant, AnalyzedPhoto['thumb']][] = [
    ['thumb', photo.thumb],
    ['preview', photo.preview],
    ['original', photo.original],
  ];
  for (const [variant, v] of order) await backend.uploadPhotoBlob(photoId, variant, v.data, v.contentType);
  await backend.api('POST', `/photos/${photoId}/commit`, opts satisfies CommitPhotoRequest);
  invalidatePhotoUrls([photoId]);
  cleanupTemp(photo.temp);
}

export async function addToExisting(backend: Backend, photoIds: string[], spaceIds: string[], albumIds: string[]): Promise<number> {
  let ok = 0;
  await runPool(photoIds, UPLOAD_CONCURRENCY, async (id) => {
    try {
      await backend.api('POST', `/photos/${id}/add`, { spaceIds, albumIds } satisfies AddToExistingRequest);
      ok++;
    } catch {
      // 하나 실패해도 계속
    }
  });
  return ok;
}

export interface BatchResult {
  uploaded: number;
  existing: number;
  failed: number;
}

/**
 * 묻지 않고 한 번에 올린다 (자동 올리기·전체 가져오기). 같은 파일은 건너뛴다.
 * 알림은 보내지 않는다 (자동으로 올라간 사진으로 가족을 깨우지 않도록).
 */
export async function uploadBatch(
  backend: Backend,
  locals: LocalPhoto[],
  opts: { spaceIds: string[]; albumIds?: string[]; quality?: Quality },
  shouldStop?: () => boolean,
): Promise<BatchResult> {
  const { analyzed, failed } = await analyzeAll(locals, opts.quality ?? 'original', undefined, shouldStop);
  if (!analyzed.length) return { uploaded: 0, existing: 0, failed: failed.length };
  let prepared: Prepared[];
  try {
    prepared = await preparePhotos(backend, analyzed);
  } catch (e) {
    analyzed.forEach((a) => cleanupTemp(a.temp));
    throw e;
  }
  let uploaded = 0;
  let existing = 0;
  let fails = failed.length;
  await runPool(prepared, UPLOAD_CONCURRENCY, async (p) => {
    if (!p.photoId) {
      existing++;
      cleanupTemp(p.photo.temp);
      return;
    }
    try {
      await uploadOne(backend, p.photoId, p.photo, { spaceIds: opts.spaceIds, albumIds: opts.albumIds ?? [], notify: false });
      uploaded++;
    } catch {
      fails++;
      cleanupTemp(p.photo.temp);
    }
  });
  return { uploaded, existing, failed: fails };
}

/** 화질별 예상 용량 (용량 절약: 긴 변 2048px JPEG 85 ≈ 화소당 0.25바이트) */
export function estimateBytes(locals: LocalPhoto[], quality: Quality): number {
  return locals.reduce((sum, l) => {
    if (quality === 'original') return sum + (l.bytes || l.width * l.height * 0.35 || 3_000_000);
    if (!l.width || !l.height) return sum + Math.min(l.bytes || 3_000_000, 900_000);
    const s = Math.min(1, 2048 / Math.max(l.width, l.height));
    const est = l.width * s * l.height * s * 0.25;
    return sum + Math.min(l.bytes || est, est);
  }, 0);
}
