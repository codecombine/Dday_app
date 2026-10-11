// 계정 삭제 (명세서 16장). 다시 시도해도 이어서 지울 수 있게 순서를 정했다 (Auth 사용자는 마지막).
import type { Album, DeleteMeRequest, Item, Space } from '@hanjibung/core';

import type { AuthUser } from '../auth/firebase-auth';
import type { Deps } from '../deps';
import { badRequest } from '../errors';
import { P, queryContainsAny, type Write } from '../repo/docstore';
import { disconnectGoogle, propagateItem } from './calendar-sync';
import { getSpace, getUser, personalSpaceId, uniq } from './common';
import { forgetPhotos } from './dedupe';
import { deleteSpace, dropMembershipForDeletion, heirOf, type PhotoChoice } from './membership';
import { hardDeletePhoto, patchPhotos, type PhotoPatch } from './photo-store';

/**
 * 탈퇴하는 사람 사진 처리 계획: '남기기' 공간에 있는 사진은 그 공간 관리자에게 소유권을 넘기고
 * (공유 범위는 남기기 공간만), 나머지는 완전히 지운다.
 */
export function planDeletionPhotos(
  photos: readonly { photoId: string; spaceIds: string[]; status: string }[],
  choices: ReadonlyMap<string, PhotoChoice>,
  heirs: ReadonlyMap<string, string>,
): { transfer: { id: string; patch: PhotoPatch }[]; remove: string[] } {
  const transfer: { id: string; patch: PhotoPatch }[] = [];
  const remove: string[] = [];
  for (const p of photos) {
    const keep = p.status === 'uploading' ? [] : p.spaceIds.filter((s) => choices.get(s) === 'keep' && heirs.get(s));
    if (keep.length) transfer.push({ id: p.photoId, patch: { ownerUid: heirs.get(keep[0]!)!, spaceIds: keep } });
    else remove.push(p.photoId);
  }
  return { transfer, remove };
}

export async function deleteAccount(deps: Deps, authUser: AuthUser, req: DeleteMeRequest): Promise<void> {
  const uid = authUser.uid;
  const user = await getUser(deps, uid);
  const personalId = user?.personalSpaceId ?? personalSpaceId(uid);
  const spaceIds = uniq([...(user?.spaceIds ?? authUser.spaces), personalId]);
  const spaces = (await Promise.all(spaceIds.map((id) => getSpace(deps, id)))).filter((s): s is Space => !!s);
  const shared = spaces.filter((s) => s.kind === 'shared');

  // 1. 공간마다 사진 처리 방식 확인 ('고르기' 공간은 직접 선택이 필요)
  const choices = new Map<string, PhotoChoice>();
  const heirs = new Map<string, string>();
  const missing: string[] = [];
  for (const s of shared) {
    const heir = heirOf(s, uid);
    if (heir) heirs.set(s.id, heir);
    if (!s.memberUids.some((u) => u !== uid)) {
      choices.set(s.id, 'remove'); // 혼자 남은 공간은 함께 없어진다
      continue;
    }
    const rule = s.rules?.onLeave ?? 'ask';
    if (rule === 'ask') {
      const c = req.photoChoices?.[s.id];
      if (c === 'keep' || c === 'remove') choices.set(s.id, c);
      else missing.push(s.id);
    } else choices.set(s.id, rule);
  }
  if (missing.length) {
    throw badRequest('공간마다 사진을 남길지 함께 지울지 골라 주세요', 'photo_choice_required', { spaceIds: missing });
  }

  // 2. 사진: 남기기 → 관리자에게, 나머지 → 완전 삭제
  const photos = await deps.index.listOwnerPhotos(uid);
  const plan = planDeletionPhotos(photos, choices, heirs);
  await patchPhotos(deps, plan.transfer);
  for (const t of plan.transfer) {
    const before = photos.find((p) => p.photoId === t.id)?.spaceIds ?? [];
    const dropped = before.filter((s) => !(t.patch.spaceIds ?? []).includes(s));
    if (dropped.length) await forgetPhotos(deps, [t.id], dropped);
  }
  await forgetPhotos(deps, plan.remove);
  for (const id of plan.remove) await hardDeletePhoto(deps, id);

  // 3. 내 항목·앨범 삭제
  const items = await deps.docs.query<Item>('items', { where: [{ field: 'ownerUid', op: 'EQUAL', value: uid }] });
  const albums = await deps.docs.query<Album>('albums', { where: [{ field: 'ownerUid', op: 'EQUAL', value: uid }] });
  const writes: Write[] = [...items.map((i): Write => ({ op: 'delete', path: i.path })), ...albums.map((a): Write => ({ op: 'delete', path: a.path }))];
  if (albums.length) {
    const albumIds = albums.map((a) => a.id);
    const inAlbums = await queryContainsAny<{ albumIds?: string[] }>(deps.docs, 'photos', 'albumIds', albumIds);
    for (const p of inAlbums) writes.push({ op: 'arrayRemove', path: p.path, field: 'albumIds', values: albumIds });
  }

  // 4. 합치기 확인 요청
  for (const field of ['ownerUid', 'requestedBy']) {
    const mrs = await deps.docs.query('mergeRequests', { where: [{ field, op: 'EQUAL', value: uid }] });
    for (const m of mrs) writes.push({ op: 'delete', path: m.path });
  }
  await deps.docs.commit(writes);

  // 5. 구글 연동: 캘린더 지우고 권한 철회, 다른 가족 캘린더에서도 내 항목 일정 삭제
  await disconnectGoogle(deps, uid, true);
  const itemIds = items.map((i) => i.id);
  deps.defer(
    (async () => {
      for (const id of itemIds) await propagateItem(deps, id);
    })(),
  );

  // 6. 공간에서 빠지기 (혼자 남은 공간은 삭제)
  for (const s of shared) {
    if (!s.memberUids.some((u) => u !== uid)) await deleteSpace(deps, s, uid, { updateUser: false });
    else await dropMembershipForDeletion(deps, s, uid, heirs.get(s.id) ?? null);
  }
  const personal = spaces.find((s) => s.id === personalId);
  if (personal) await deleteSpace(deps, personal, uid, { updateUser: false });

  // 7. 기기, 사용자 문서, 로그인 계정
  const devices = await deps.docs.query(P.devices(uid));
  await deps.docs.commit([...devices.map((d): Write => ({ op: 'delete', path: d.path })), { op: 'delete', path: P.user(uid) }]);
  await deps.auth.deleteUser(uid);
}
