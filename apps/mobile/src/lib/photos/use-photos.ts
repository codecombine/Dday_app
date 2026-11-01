// 사진·휴지통·중복 묶음·합치기 요청 구독 훅
import { isAdmin, type DedupeGroup, type MergeRequest, type Photo } from '@hanjibung/core';
import { useEffect, useMemo, useState } from 'react';

import { useSession } from '@/lib/session';

/** 내가 볼 수 있는 사진 (올리기 완료된 것만). loaded가 false면 아직 받는 중 */
export function usePhotos(): { photos: Photo[]; loaded: boolean } {
  const { backend, mySpaceIds, claimsVersion } = useSession();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loaded, setLoaded] = useState(false);
  const key = mySpaceIds.join(',');
  useEffect(() => {
    if (!key) return;
    return backend.watchPhotos(key.split(','), (rows) => {
      setPhotos(rows);
      setLoaded(true);
    });
  }, [backend, key, claimsVersion]);
  return { photos, loaded };
}

export function usePhotoMap(photos: Photo[]): Record<string, Photo> {
  return useMemo(() => Object.fromEntries(photos.map((p) => [p.id, p])), [photos]);
}

export function useTrash(): { photos: Photo[]; loaded: boolean } {
  const { backend, uid } = useSession();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!uid) return;
    return backend.watchTrash(uid, (rows) => {
      setPhotos([...rows].sort((a, b) => (b.trashedAt ?? 0) - (a.trashedAt ?? 0)));
      setLoaded(true);
    });
  }, [backend, uid]);
  return { photos, loaded };
}

/** 여러 공간의 열린 중복 묶음 (공간 ID → 묶음) */
export function useDedupeGroups(spaceIds: string[]): Record<string, DedupeGroup[]> {
  const { backend, claimsVersion } = useSession();
  const [bySpace, setBySpace] = useState<Record<string, DedupeGroup[]>>({});
  const key = spaceIds.join(',');
  useEffect(() => {
    if (!key) {
      setBySpace({});
      return;
    }
    const ids = key.split(',');
    const unsubs = ids.map((sid) => backend.watchDedupeGroups(sid, (groups) => setBySpace((prev) => ({ ...prev, [sid]: groups }))));
    return () => unsubs.forEach((u) => u());
  }, [backend, key, claimsVersion]);
  return bySpace;
}

/** 정리하면 휴지통으로 갈 사진 수 (같은 파일·사본 묶음에서 원본을 뺀 수) */
export function removableCount(groups: DedupeGroup[]): number {
  return groups.filter((g) => g.status === 'open' && g.kind !== 'similar').reduce((n, g) => n + g.photoIds.length - 1, 0);
}

/** 내가 관리하는 공용 공간들의 중복 정리 요약. bestSpaceId는 정리할 것이 가장 많은 공간 */
export function useAdminDedupe(): { removable: number; similarGroups: number; bestSpaceId: string | null } {
  const { spaces, uid } = useSession();
  const adminKey = spaces
    .filter((s) => s.kind === 'shared' && isAdmin(s, uid))
    .map((s) => s.id)
    .join(',');
  const bySpace = useDedupeGroups(adminKey ? adminKey.split(',') : []);
  return useMemo(() => {
    let removable = 0;
    let similarGroups = 0;
    let best: string | null = null;
    let bestCount = 0;
    for (const sid of adminKey ? adminKey.split(',') : []) {
      const groups = (bySpace[sid] ?? []).filter((g) => g.status === 'open');
      const r = removableCount(groups);
      const sim = groups.filter((g) => g.kind === 'similar').length;
      removable += r;
      similarGroups += sim;
      if (r + sim > bestCount) {
        bestCount = r + sim;
        best = sid;
      }
    }
    return { removable, similarGroups, bestSpaceId: best };
  }, [bySpace, adminKey]);
}

export function useMergeRequests(): MergeRequest[] {
  const { backend, uid } = useSession();
  const [reqs, setReqs] = useState<MergeRequest[]>([]);
  useEffect(() => {
    if (!uid) return;
    return backend.watchMergeRequests(uid, (rows) => setReqs(rows.filter((r) => r.status === 'pending')));
  }, [backend, uid]);
  return reqs;
}
