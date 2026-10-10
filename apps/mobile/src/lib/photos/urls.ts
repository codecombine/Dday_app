// 사진 서명 주소 (명세서 17.2). 앱은 주소를 저장하지 않고, 화면에 보일 때 Worker에 묶음으로 요청한다.
// 메모리 캐시: 사진 ID + 종류마다 주소와 만료 시각. 만료 2분 전부터는 새로 받는다.
import type { PhotoUrlsRequest, PhotoUrlsResponse, PhotoVariant } from '@hanjibung/core';
import { useEffect, useMemo, useState } from 'react';

import type { Backend } from '@/lib/backend';
import { useSession } from '@/lib/session';

const MAX_BATCH = 100;
const MARGIN_MS = 2 * 60_000;

interface Entry {
  url: string;
  expiresAt: number;
}

const cache = new Map<string, Entry>();
const listeners = new Set<() => void>();
const queued = new Map<PhotoVariant, Set<string>>();
const inflight = new Set<string>();
/** 실패한 요청은 잠시 쉬었다가 다시 (무한 반복 방지) */
const backoff = new Map<string, number>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let backendRef: Backend | null = null;

const key = (id: string, v: PhotoVariant) => `${v}:${id}`;
const fresh = (e: Entry | undefined, now = Date.now()) => !!e && e.expiresAt - MARGIN_MS > now;

function notify() {
  listeners.forEach((l) => l());
}

async function requestBatch(backend: Backend, variant: PhotoVariant, ids: string[]) {
  try {
    const res = await backend.api<PhotoUrlsResponse>('POST', '/photos/urls', { ids, variant } satisfies PhotoUrlsRequest);
    for (const id of ids) {
      const url = res.urls[id];
      if (url) cache.set(key(id, variant), { url, expiresAt: res.expiresAt });
      else backoff.set(key(id, variant), Date.now() + 60_000); // 볼 수 없거나 지워진 사진
    }
  } catch {
    const until = Date.now() + 10_000;
    ids.forEach((id) => backoff.set(key(id, variant), until));
  } finally {
    ids.forEach((id) => inflight.delete(key(id, variant)));
    notify();
  }
}

function flush() {
  flushTimer = null;
  const backend = backendRef;
  if (!backend) return;
  for (const [variant, set] of queued) {
    const ids = [...set];
    set.clear();
    for (let i = 0; i < ids.length; i += MAX_BATCH) void requestBatch(backend, variant, ids.slice(i, i + MAX_BATCH));
  }
}

function enqueue(backend: Backend, ids: string[], variant: PhotoVariant) {
  backendRef = backend;
  const now = Date.now();
  let added = false;
  for (const id of ids) {
    const k = key(id, variant);
    if (fresh(cache.get(k), now) || inflight.has(k) || (backoff.get(k) ?? 0) > now) continue;
    inflight.add(k);
    if (!queued.has(variant)) queued.set(variant, new Set());
    queued.get(variant)!.add(id);
    added = true;
  }
  // 같은 순간에 그려지는 썸네일 요청을 한 번에 모은다
  if (added && !flushTimer) flushTimer = setTimeout(flush, 16);
}

/** 캐시에 있는 주소 (만료 여부와 상관없이 마지막 주소, 없으면 undefined) */
export function cachedPhotoUrl(id: string, variant: PhotoVariant): string | undefined {
  return cache.get(key(id, variant))?.url;
}

/** 화면 밖에서 바로 주소가 필요할 때 (다운로드 등). 캐시가 신선하면 그대로 쓴다 */
export async function getPhotoUrls(backend: Backend, ids: string[], variant: PhotoVariant): Promise<Record<string, string>> {
  const missing = ids.filter((id) => !fresh(cache.get(key(id, variant))));
  for (let i = 0; i < missing.length; i += MAX_BATCH) {
    const part = missing.slice(i, i + MAX_BATCH);
    const res = await backend.api<PhotoUrlsResponse>('POST', '/photos/urls', { ids: part, variant } satisfies PhotoUrlsRequest);
    for (const id of part) if (res.urls[id]) cache.set(key(id, variant), { url: res.urls[id]!, expiresAt: res.expiresAt });
  }
  const out: Record<string, string> = {};
  for (const id of ids) {
    const e = cache.get(key(id, variant));
    if (e) out[id] = e.url;
  }
  notify();
  return out;
}

/** 새로 올린 사진처럼 주소가 바뀌었을 수 있으면 캐시를 비운다 */
export function invalidatePhotoUrls(ids: string[]) {
  for (const id of ids) for (const v of ['thumb', 'preview', 'original'] as const) cache.delete(key(id, v));
  notify();
}

/** 여러 사진의 서명 주소. 아직 없으면 그 사진은 결과에 빠진다 */
export function usePhotoUrls(ids: string[], variant: PhotoVariant): Record<string, string> {
  const { backend } = useSession();
  const [tick, setTick] = useState(0);
  const idsKey = ids.join(',');

  useEffect(() => {
    const l = () => setTick((t) => t + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  useEffect(() => {
    if (!idsKey) return;
    const list = idsKey.split(',');
    enqueue(backend, list, variant);
    // 만료 직전에 다시 받도록 예약
    const soonest = Math.min(...list.map((id) => cache.get(key(id, variant))?.expiresAt ?? Infinity));
    if (!Number.isFinite(soonest)) return;
    const wait = Math.max(5_000, soonest - MARGIN_MS - Date.now() + 1_000);
    const t = setTimeout(() => setTick((x) => x + 1), Math.min(wait, 2_147_000_000));
    return () => clearTimeout(t);
  }, [backend, idsKey, variant, tick]);

  return useMemo(() => {
    const out: Record<string, string> = {};
    if (!idsKey) return out;
    for (const id of idsKey.split(',')) {
      const e = cache.get(key(id, variant));
      if (e) out[id] = e.url;
    }
    return out;
    // tick이 바뀌면 캐시를 다시 읽는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, variant, tick]);
}

export function usePhotoUrl(id: string | null | undefined, variant: PhotoVariant): string | undefined {
  const urls = usePhotoUrls(id ? [id] : [], variant);
  return id ? urls[id] : undefined;
}
