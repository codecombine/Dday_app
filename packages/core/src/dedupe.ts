// 중복 사진 판정 (명세서 9장)
import { hammingDistance } from './phash';
import type { DedupeKind, Millis, PhotoFingerprint, PhotoSource } from './types';

export interface DedupeThresholds {
  /** 화질 낮은 사본으로 보는 최대 pHash 거리 */
  copyMaxDistance: number;
  /** 비슷한 사진으로 보는 최대 pHash 거리 */
  similarMaxDistance: number;
  /** 해상도(픽셀 수) 차이가 이 배수 이상이면 사본 근거 */
  resolutionRatio: number;
}

export const DEFAULT_THRESHOLDS: DedupeThresholds = {
  copyMaxDistance: 6,
  similarMaxDistance: 10,
  resolutionRatio: 1.2,
};

export interface DedupeCandidate extends PhotoFingerprint {
  id: string;
  createdAt: Millis;
}

/** 두 사진의 관계. 관계 없으면 null */
export function classifyPair(
  a: DedupeCandidate,
  b: DedupeCandidate,
  t: DedupeThresholds = DEFAULT_THRESHOLDS,
): DedupeKind | null {
  if (a.sha256 === b.sha256) return 'exact';
  const dist = hammingDistance(a.phash, b.phash);
  if (dist > t.similarMaxDistance) return null;
  if (dist <= t.copyMaxDistance) {
    const pa = a.width * a.height;
    const pb = b.width * b.height;
    const ratio = Math.max(pa, pb) / Math.max(1, Math.min(pa, pb));
    const exifDiffers = a.hasExif !== b.hasExif;
    const kakao = a.source === 'kakao' || b.source === 'kakao';
    if (ratio >= t.resolutionRatio || exifDiffers || kakao) return 'copy';
  }
  return 'similar';
}

/** 원본 고르는 순서: 픽셀 수 → 촬영 정보 → 용량 → 촬영 일시 → 먼저 올라온 것 */
export function compareOriginal(a: DedupeCandidate, b: DedupeCandidate): number {
  const pa = a.width * a.height;
  const pb = b.width * b.height;
  if (pa !== pb) return pb - pa;
  if (a.hasExif !== b.hasExif) return a.hasExif ? -1 : 1;
  if (a.bytes !== b.bytes) return b.bytes - a.bytes;
  const ta = a.takenAt ?? Number.POSITIVE_INFINITY;
  const tb = b.takenAt ?? Number.POSITIVE_INFINITY;
  if (ta !== tb) return ta - tb;
  return a.createdAt - b.createdAt;
}

export function pickOriginal<T extends DedupeCandidate>(photos: readonly T[]): T {
  if (photos.length === 0) throw new Error('사진이 없습니다');
  return [...photos].sort(compareOriginal)[0]!;
}

export interface ComputedGroup {
  kind: DedupeKind;
  photoIds: string[];
  keepPhotoId: string;
  /** 미리 '지우기'로 선택할 사진 (비슷한 사진은 빈 배열) */
  suggestedRemoveIds: string[];
}

const KIND_RANK: Record<DedupeKind, number> = { exact: 0, copy: 1, similar: 2 };

/**
 * 사진 목록에서 중복 묶음을 만든다.
 * 같은 파일·사본 관계로 이어진 사진은 한 묶음(연결 요소)으로 합치고, 묶음의 종류는 가장 약한 관계를 따른다.
 * 비슷한 사진은 같은·사본 묶음에 들어가지 않은 사진끼리만 따로 묶는다.
 */
export function buildGroups(
  photos: readonly DedupeCandidate[],
  t: DedupeThresholds = DEFAULT_THRESHOLDS,
  pairs?: ReadonlyArray<[number, number]>,
): ComputedGroup[] {
  const n = photos.length;
  const strongParent = Array.from({ length: n }, (_, i) => i);
  const find = (p: number[], x: number): number => {
    while (p[x] !== x) {
      p[x] = p[p[x]!]!;
      x = p[x]!;
    }
    return x;
  };
  const union = (p: number[], a: number, b: number) => {
    const ra = find(p, a);
    const rb = find(p, b);
    if (ra !== rb) p[rb] = ra;
  };
  const strongKind = new Map<number, DedupeKind>(); // 루트 → 가장 약한 강한관계
  const similarEdges: [number, number][] = [];

  const candidatePairs: [number, number][] = pairs
    ? [...pairs]
    : (() => {
        const all: [number, number][] = [];
        for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) all.push([i, j]);
        return all;
      })();

  const kinds: [number, number, DedupeKind][] = [];
  for (const [i, j] of candidatePairs) {
    const k = classifyPair(photos[i]!, photos[j]!, t);
    if (!k) continue;
    if (k === 'similar') similarEdges.push([i, j]);
    else {
      union(strongParent, i, j);
      kinds.push([i, j, k]);
    }
  }
  for (const [i, , k] of kinds) {
    const r = find(strongParent, i);
    const prev = strongKind.get(r);
    if (!prev || KIND_RANK[k] > KIND_RANK[prev]) strongKind.set(r, k);
  }

  const groups: ComputedGroup[] = [];
  const inStrong = new Set<number>();
  const byRoot = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(strongParent, i);
    if (!byRoot.has(r)) byRoot.set(r, []);
    byRoot.get(r)!.push(i);
  }
  for (const [root, members] of byRoot) {
    if (members.length < 2) continue;
    members.forEach((m) => inStrong.add(m));
    const list = members.map((m) => photos[m]!);
    const keep = pickOriginal(list);
    groups.push({
      kind: strongKind.get(root) ?? 'copy',
      photoIds: list.map((p) => p.id),
      keepPhotoId: keep.id,
      suggestedRemoveIds: list.filter((p) => p.id !== keep.id).map((p) => p.id),
    });
  }

  const simParent = Array.from({ length: n }, (_, i) => i);
  for (const [i, j] of similarEdges) {
    if (inStrong.has(i) || inStrong.has(j)) continue;
    union(simParent, i, j);
  }
  const simRoots = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    if (inStrong.has(i)) continue;
    const r = find(simParent, i);
    if (!simRoots.has(r)) simRoots.set(r, []);
    simRoots.get(r)!.push(i);
  }
  for (const members of simRoots.values()) {
    if (members.length < 2) continue;
    const list = members.map((m) => photos[m]!);
    groups.push({
      kind: 'similar',
      photoIds: list.map((p) => p.id),
      keepPhotoId: pickOriginal(list).id,
      suggestedRemoveIds: [],
    });
  }
  return groups.sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind]);
}

/** 파일 이름·EXIF로 출처 추정 */
export function guessSource(fileName: string, hasExif: boolean): PhotoSource {
  const name = fileName.toLowerCase();
  if (name.startsWith('kakaotalk_') || name.includes('kakaotalk')) return 'kakao';
  if (name.startsWith('screenshot') || name.includes('스크린샷') || name.includes('screen_shot')) return 'screenshot';
  if (hasExif) return 'camera';
  if (/^(img|dsc|pxl|dcim|photo)[_-]?\d/.test(name) || /^\d{8}_\d{6}/.test(name)) return 'camera';
  return 'unknown';
}
