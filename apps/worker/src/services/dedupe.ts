// 중복 사진 정리 (명세서 9장): 후보 찾기·묶음 갱신·정리·합치기 확인
import {
  type ApplyDedupeResponse,
  buildGroups,
  classifyPair,
  type ComputedGroup,
  type DedupeCandidate,
  type DedupeGroup,
  type DedupeThresholds,
  type MergeRequest,
  mergeNeedsOwnerApproval,
  type Photo,
  phashBands,
} from '@hanjibung/core';

import type { Deps } from '../deps';
import { conflict, forbidden, notFound } from '../errors';
import { type Doc, P, queryContainsAny, type Write } from '../repo/docstore';
import type { PhotoIndexRow } from '../repo/index-store';
import { randomId } from '../util/crypto';
import { HOUR } from '../util/time';
import {
  getPhotoDoc,
  getPhotoDocs,
  normalizeShare,
  personalSpaceId,
  requireAdmin,
  requireSpace,
  sameSet,
  uniq,
} from './common';
import { pushToUsers } from './notify';
import { patchPhoto, trashPhotos } from './photo-store';

/** 서버 확장 필드: 원본 주인 승인을 기다리는 사본 */
export interface StoredMergeRequest extends MergeRequest {
  removePhotoIds: string[];
}

export function toCandidate(r: PhotoIndexRow): DedupeCandidate {
  return {
    id: r.photoId,
    sha256: r.sha256,
    phash: r.phash,
    width: r.width,
    height: r.height,
    bytes: r.bytes,
    hasExif: r.hasExif,
    takenAt: r.takenAt,
    source: r.source,
    createdAt: r.createdAt,
  };
}

/**
 * 전체 검사용 후보 쌍: 같은 SHA-256 또는 pHash 조각(8비트×8)이 같은 사진끼리만 비교한다.
 * 같은 쌍은 처음으로 같은 조각에서만 세고, 관계가 있는 쌍만 돌려준다.
 */
export function candidatePairs(
  photos: readonly DedupeCandidate[],
  t: DedupeThresholds,
  maxComparisons = 5_000_000,
): [number, number][] {
  const out: [number, number][] = [];
  const bands = photos.map((p) => phashBands(p.phash));
  let comparisons = 0;

  const bySha = new Map<string, number[]>();
  photos.forEach((p, i) => {
    const list = bySha.get(p.sha256);
    if (list) list.push(i);
    else bySha.set(p.sha256, [i]);
  });
  for (const idx of bySha.values()) {
    for (let a = 0; a < idx.length; a++) for (let b = a + 1; b < idx.length; b++) out.push([idx[a]!, idx[b]!]);
  }

  const bandCount = bands[0]?.length ?? 0;
  for (let band = 0; band < bandCount; band++) {
    const buckets = new Map<string, number[]>();
    bands.forEach((bs, i) => {
      const key = bs[band]!;
      const list = buckets.get(key);
      if (list) list.push(i);
      else buckets.set(key, [i]);
    });
    for (const idx of buckets.values()) {
      for (let a = 0; a < idx.length; a++) {
        for (let b = a + 1; b < idx.length; b++) {
          const i = idx[a]!;
          const j = idx[b]!;
          if (photos[i]!.sha256 === photos[j]!.sha256) continue; // SHA 묶음에서 이미 셌다
          let earlier = false;
          for (let k = 0; k < band; k++) {
            if (bands[i]![k] === bands[j]![k]) {
              earlier = true;
              break;
            }
          }
          if (earlier) continue;
          if (++comparisons > maxComparisons) return out;
          if (classifyPair(photos[i]!, photos[j]!, t)) out.push([i, j]);
        }
      }
    }
  }
  return out;
}

export interface GroupPlan {
  upserts: DedupeGroup[];
  deletes: string[];
  /** 새로 생긴 묶음 (관리자 알림용) */
  created: DedupeGroup[];
  /** 반영 뒤 열린 묶음 수 */
  total: number;
}

/**
 * 새로 계산한 묶음을 기존 열린 묶음에 맞춘다.
 * 사진이 겹치는 기존 묶음의 ID를 다시 쓰고, 이미 무시·정리·보류된 묶음의 부분집합은 다시 열지 않는다.
 */
export function reconcileGroups(
  existingOpen: readonly DedupeGroup[],
  computed: readonly ComputedGroup[],
  suppressed: readonly (readonly string[])[],
  ctx: { spaceId: string; now: number; newId: () => string },
): GroupPlan {
  const isSuppressed = (ids: readonly string[]) => suppressed.some((s) => ids.every((id) => s.includes(id)));
  const wanted = computed.filter((g) => !isSuppressed(g.photoIds)).sort((a, b) => b.photoIds.length - a.photoIds.length);
  const used = new Set<string>();
  const upserts: DedupeGroup[] = [];
  const created: DedupeGroup[] = [];
  for (const g of wanted) {
    let best: DedupeGroup | null = null;
    let bestOverlap = 0;
    for (const e of existingOpen) {
      if (used.has(e.id)) continue;
      const overlap = e.photoIds.filter((id) => g.photoIds.includes(id)).length;
      if (overlap > bestOverlap) {
        best = e;
        bestOverlap = overlap;
      }
    }
    const base = { spaceId: ctx.spaceId, kind: g.kind, photoIds: g.photoIds, keepPhotoId: g.keepPhotoId, status: 'open' as const, updatedAt: ctx.now };
    if (best) {
      used.add(best.id);
      const same = best.kind === g.kind && best.keepPhotoId === g.keepPhotoId && sameSet(best.photoIds, g.photoIds);
      if (!same) upserts.push({ id: best.id, ...base });
    } else {
      const ng: DedupeGroup = { id: ctx.newId(), ...base };
      upserts.push(ng);
      created.push(ng);
    }
  }
  const deletes = existingOpen.filter((e) => !used.has(e.id)).map((e) => e.id);
  return { upserts, deletes, created, total: wanted.length };
}

async function applyGroupPlan(deps: Deps, plan: GroupPlan): Promise<void> {
  const writes: Write[] = [
    ...plan.upserts.map((g): Write => ({ op: 'set', path: P.group(g.id), data: { ...g } })),
    ...plan.deletes.map((id): Write => ({ op: 'delete', path: P.group(id) })),
  ];
  if (writes.length) await deps.docs.commit(writes);
}

function groupsOf(rows: Doc<DedupeGroup>[]): DedupeGroup[] {
  return rows.map((r) => ({ ...r.data, id: r.id, photoIds: r.data.photoIds ?? [] }));
}

async function groupsContaining(deps: Deps, photoIds: readonly string[]): Promise<DedupeGroup[]> {
  if (!photoIds.length) return [];
  return groupsOf(await queryContainsAny<DedupeGroup>(deps.docs, 'dedupeGroups', 'photoIds', photoIds));
}

/** 사진 하나가 올라오거나(공간이 늘어나) 바뀌었을 때 그 공간들의 묶음을 갱신한다 */
export async function updateDedupeForPhoto(deps: Deps, photoId: string, onlySpaces?: readonly string[]): Promise<DedupeGroup[]> {
  const row = await deps.index.getPhoto(photoId);
  if (!row || row.status !== 'active') return [];
  const t = deps.cfg.thresholds;
  const me = toCandidate(row);
  const created: DedupeGroup[] = [];
  for (const spaceId of onlySpaces ?? row.spaceIds) {
    if (!row.spaceIds.includes(spaceId)) continue;
    const cands = await deps.index.findDedupeCandidates(spaceId, row);
    const related = cands.filter((c) => classifyPair(me, toCandidate(c), t) !== null);
    if (!related.length) continue;
    const touched = (await groupsContaining(deps, [photoId, ...related.map((r) => r.photoId)])).filter((g) => g.spaceId === spaceId);
    const open = touched.filter((g) => g.status === 'open');
    const ids = uniq([photoId, ...related.map((r) => r.photoId), ...open.flatMap((g) => g.photoIds)]);
    const rows = (await deps.index.getPhotos(ids)).filter((r) => r.status === 'active' && r.spaceIds.includes(spaceId));
    const computed = buildGroups(rows.map(toCandidate), t);
    const plan = reconcileGroups(
      open,
      computed,
      touched.filter((g) => g.status !== 'open').map((g) => g.photoIds),
      { spaceId, now: deps.now(), newId: () => randomId() },
    );
    await applyGroupPlan(deps, plan);
    created.push(...plan.created);
  }
  const reviewable = created.filter((g) => g.kind !== 'similar');
  if (reviewable.length) await notifyDedupeReview(deps, reviewable);
  return created;
}

/** 사진이 휴지통으로 가거나 공간에서 빠졌을 때 열린 묶음에서 뺀다 */
export async function forgetPhotos(deps: Deps, photoIds: readonly string[], onlySpaces?: readonly string[]): Promise<void> {
  if (!photoIds.length) return;
  const gone = new Set(photoIds);
  const groups = (await groupsContaining(deps, photoIds)).filter(
    (g) => g.status === 'open' && (!onlySpaces || onlySpaces.includes(g.spaceId)),
  );
  for (const g of groups) {
    const remaining = g.photoIds.filter((id) => !gone.has(id));
    const rows = (await deps.index.getPhotos(remaining)).filter((r) => r.status === 'active' && r.spaceIds.includes(g.spaceId));
    const computed = rows.length >= 2 ? buildGroups(rows.map(toCandidate), deps.cfg.thresholds) : [];
    await applyGroupPlan(deps, reconcileGroups([g], computed, [], { spaceId: g.spaceId, now: deps.now(), newId: () => randomId() }));
  }
}

/** 공간 전체를 다시 검사한다 ("다시 검사") */
export async function scanSpace(deps: Deps, actorUid: string, spaceId: string): Promise<number> {
  const space = await requireSpace(deps, spaceId);
  requireAdmin(space, actorUid);
  const t = deps.cfg.thresholds;
  const rows = await deps.index.listSpacePhotos(spaceId, 'active');
  const cands = rows.map(toCandidate);
  const computed = buildGroups(cands, t, candidatePairs(cands, t));
  const existing = groupsOf(
    await deps.docs.query<DedupeGroup>('dedupeGroups', { where: [{ field: 'spaceId', op: 'EQUAL', value: spaceId }] }),
  );
  const plan = reconcileGroups(
    existing.filter((g) => g.status === 'open'),
    computed,
    existing.filter((g) => g.status !== 'open').map((g) => g.photoIds),
    { spaceId, now: deps.now(), newId: () => randomId() },
  );
  await applyGroupPlan(deps, plan);
  return plan.total;
}

/** 관리자에게 "중복 사진 정리 가능" 알림 (공간마다 6시간에 한 번) */
async function notifyDedupeReview(deps: Deps, groups: readonly DedupeGroup[]): Promise<void> {
  for (const spaceId of uniq(groups.map((g) => g.spaceId))) {
    const key = `dedupe-notify:${spaceId}`;
    const last = Number((await deps.index.getState(key)) ?? 0);
    if (deps.now() - last < 6 * HOUR) continue;
    const space = await deps.docs.get<{ name?: string; adminUids?: string[]; kind?: string }>(P.space(spaceId));
    if (!space) continue;
    await deps.index.setState(key, String(deps.now()));
    const where = space.kind === 'personal' ? '내 사진' : `'${space.name ?? ''}'`;
    await pushToUsers(
      deps,
      space.adminUids ?? [],
      {
        notification: { title: '중복 사진', body: `${where}에 정리할 수 있는 중복 사진이 있어요` },
        data: { type: 'dedupe', spaceId, tag: `dedupe-${spaceId}` },
      },
      'dedupeReview',
    );
  }
}

// ── 정리하기 ─────────────────────────────────────────

export interface ApplyPlan {
  /** 원본에 합칠 공유 범위·앨범·촬영 일시 (바뀌지 않으면 null) */
  keepUpdate: { spaceIds: string[]; albumIds: string[]; takenAt: number | null } | null;
  /** 바로 휴지통으로 보낼 사본 */
  trash: string[];
  /** 원본 주인 확인을 기다리는 사본 */
  held: string[];
  /** 승인되면 원본에 새로 보이게 될 공간 */
  heldAddSpaceIds: string[];
}

type MergePhoto = Pick<Photo, 'id' | 'ownerUid' | 'spaceIds' | 'albumIds' | 'takenAt'>;

/**
 * 사본을 원본에 합치는 계획 (명세서 9.3).
 * 다른 사람 사본을 합치면 원본이 원본 주인이 정하지 않은 공간에 새로 보이게 되는 경우 → 주인 확인 대기.
 * 정리하는 사람이 원본 주인이면 그 자리에서 승인한 것으로 본다.
 */
export function planDedupeApply(keep: MergePhoto, removed: readonly MergePhoto[], actorUid: string): ApplyPlan {
  const held =
    actorUid === keep.ownerUid
      ? []
      : removed.filter((r) => r.ownerUid !== keep.ownerUid && mergeNeedsOwnerApproval(keep, [r]).length > 0);
  const direct = removed.filter((r) => !held.includes(r));
  const spaceIds = normalizeShare([...keep.spaceIds, ...direct.flatMap((r) => r.spaceIds)], personalSpaceId(keep.ownerUid));
  const albumIds = uniq([...keep.albumIds, ...direct.flatMap((r) => r.albumIds)]);
  const takenAt = keep.takenAt ?? direct.find((r) => r.takenAt !== null && r.takenAt !== undefined)?.takenAt ?? null;
  const changed = !sameSet(spaceIds, keep.spaceIds) || !sameSet(albumIds, keep.albumIds) || takenAt !== keep.takenAt;
  return {
    keepUpdate: changed ? { spaceIds, albumIds, takenAt } : null,
    trash: direct.map((r) => r.id),
    held: held.map((r) => r.id),
    heldAddSpaceIds: mergeNeedsOwnerApproval({ ownerUid: keep.ownerUid, spaceIds }, held),
  };
}

async function requireGroup(deps: Deps, groupId: string): Promise<DedupeGroup> {
  const g = await deps.docs.get<DedupeGroup>(P.group(groupId));
  if (!g) throw notFound('중복 묶음을 찾을 수 없어요', 'group_not_found');
  return { ...g, id: groupId, photoIds: g.photoIds ?? [] };
}

export async function applyDedupe(
  deps: Deps,
  actorUid: string,
  groupId: string,
  req: { keepPhotoId: string; removePhotoIds: string[] },
): Promise<ApplyDedupeResponse> {
  const group = await requireGroup(deps, groupId);
  const space = await requireSpace(deps, group.spaceId);
  requireAdmin(space, actorUid);
  if (group.status !== 'open') throw conflict('group_closed', '이미 정리했거나 무시한 묶음이에요');
  const removeIds = uniq(req.removePhotoIds).filter((id) => id !== req.keepPhotoId);
  if (!group.photoIds.includes(req.keepPhotoId) || removeIds.some((id) => !group.photoIds.includes(id))) {
    throw conflict('group_mismatch', '묶음에 없는 사진이 있어요. 새로고침해 주세요');
  }
  const photos = await getPhotoDocs(deps, [req.keepPhotoId, ...removeIds]);
  const keep = photos.get(req.keepPhotoId);
  if (!keep || keep.status !== 'active') throw conflict('keep_not_active', '남길 사진이 휴지통에 있거나 없어요');
  const removed = removeIds.map((id) => photos.get(id)).filter((p): p is Photo => !!p && p.status === 'active');

  const plan = planDedupeApply(keep, removed, actorUid);
  const now = deps.now();
  if (plan.keepUpdate) await patchPhoto(deps, keep.id, plan.keepUpdate);
  if (plan.trash.length) await trashPhotos(deps, plan.trash, actorUid);

  const writes: Write[] = [];
  if (plan.held.length) {
    const mr: StoredMergeRequest = {
      id: randomId(),
      groupId,
      photoId: keep.id,
      ownerUid: keep.ownerUid,
      addSpaceIds: plan.heldAddSpaceIds,
      requestedBy: actorUid,
      status: 'pending',
      createdAt: now,
      removePhotoIds: plan.held,
    };
    writes.push({ op: 'set', path: P.mergeRequest(mr.id), data: { ...mr } });
    writes.push({ op: 'update', path: P.group(groupId), data: { status: 'awaiting_owner', keepPhotoId: keep.id, updatedAt: now } });
  } else {
    writes.push({ op: 'update', path: P.group(groupId), data: { status: 'applied', keepPhotoId: keep.id, updatedAt: now } });
  }
  await deps.docs.commit(writes);

  if (plan.held.length) {
    await pushToUsers(deps, [keep.ownerUid], {
      notification: { title: '사진 합치기 확인', body: '가족이 중복 사진을 정리하면서 내 사진을 다른 공간에도 보이게 하려고 해요' },
      data: { type: 'merge-request', groupId, photoId: keep.id },
    });
  }
  await forgetPhotos(deps, plan.trash);
  const added = plan.keepUpdate ? plan.keepUpdate.spaceIds.filter((s) => !keep.spaceIds.includes(s)) : [];
  if (added.length) deps.defer(updateDedupeForPhoto(deps, keep.id, added));
  return { trashed: plan.trash, awaitingOwner: plan.held };
}

export async function dismissDedupe(deps: Deps, actorUid: string, groupId: string): Promise<void> {
  const group = await requireGroup(deps, groupId);
  const space = await requireSpace(deps, group.spaceId);
  requireAdmin(space, actorUid);
  if (group.status !== 'open') throw conflict('group_closed', '이미 정리했거나 무시한 묶음이에요');
  await deps.docs.commit([{ op: 'update', path: P.group(groupId), data: { status: 'dismissed', updatedAt: deps.now() } }]);
}

// ── 합치기 확인 (원본 주인) ──────────────────────────────

async function requireMergeRequest(deps: Deps, uid: string, id: string): Promise<StoredMergeRequest> {
  const mr = await deps.docs.get<StoredMergeRequest>(P.mergeRequest(id));
  if (!mr) throw notFound('확인 요청을 찾을 수 없어요', 'merge_request_not_found');
  if (mr.ownerUid !== uid) throw forbidden('사진 주인만 확인할 수 있어요');
  if (mr.status !== 'pending') throw conflict('merge_request_closed', '이미 처리한 요청이에요');
  return { ...mr, id, removePhotoIds: mr.removePhotoIds ?? [], addSpaceIds: mr.addSpaceIds ?? [] };
}

export async function approveMerge(deps: Deps, uid: string, id: string): Promise<{ trashed: string[] }> {
  const mr = await requireMergeRequest(deps, uid, id);
  const keep = await getPhotoDoc(deps, mr.photoId);
  if (!keep || keep.status !== 'active') throw conflict('keep_not_active', '원본 사진이 휴지통에 있거나 없어요');
  const held = [...(await getPhotoDocs(deps, mr.removePhotoIds)).values()].filter((p) => p.status === 'active');
  const spaceIds = normalizeShare(
    [...keep.spaceIds, ...mr.addSpaceIds, ...held.flatMap((p) => p.spaceIds)],
    personalSpaceId(keep.ownerUid),
  );
  const albumIds = uniq([...keep.albumIds, ...held.flatMap((p) => p.albumIds)]);
  const takenAt = keep.takenAt ?? held.find((p) => p.takenAt !== null)?.takenAt ?? null;
  await patchPhoto(deps, keep.id, { spaceIds, albumIds, takenAt });
  const trashed = held.map((p) => p.id);
  if (trashed.length) await trashPhotos(deps, trashed, mr.requestedBy);
  const writes: Write[] = [{ op: 'update', path: P.mergeRequest(id), data: { status: 'approved' } }];
  if (mr.groupId) writes.push({ op: 'update', path: P.group(mr.groupId), data: { status: 'applied', updatedAt: deps.now() } });
  await deps.docs.commit(writes);
  await forgetPhotos(deps, trashed);
  const added = spaceIds.filter((s) => !keep.spaceIds.includes(s));
  if (added.length) deps.defer(updateDedupeForPhoto(deps, keep.id, added));
  return { trashed };
}

export async function rejectMerge(deps: Deps, uid: string, id: string): Promise<void> {
  const mr = await requireMergeRequest(deps, uid, id);
  const writes: Write[] = [{ op: 'update', path: P.mergeRequest(id), data: { status: 'rejected' } }];
  if (mr.groupId) {
    const group = await deps.docs.get<DedupeGroup>(P.group(mr.groupId));
    if (group) {
      // 이번 정리로 휴지통에 간 사본이 하나라도 있으면 '정리됨', 아니면 '무시'
      const rows = await deps.index.getPhotos((group.photoIds ?? []).filter((p) => p !== mr.photoId));
      const status = rows.some((r) => r.status === 'trashed') ? 'applied' : 'dismissed';
      writes.push({ op: 'update', path: P.group(mr.groupId), data: { status, updatedAt: deps.now() } });
    }
  }
  await deps.docs.commit(writes);
}
