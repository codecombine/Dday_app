// 공간·공유 범위·권한 규칙 (명세서 3장)
import type { Item, Member, Photo, Space } from './types';

/** 사용자가 속한 공간 목록 (Firebase 맞춤 클레임 `spaces`와 같은 의미) */
export type MySpaces = readonly string[];

export function canView(target: { spaceIds: readonly string[] }, mySpaces: MySpaces): boolean {
  return target.spaceIds.some((id) => mySpaces.includes(id));
}

/**
 * 공유 범위 선택 토글 규칙: "나만 보기"(개인 공간)를 고르면 다른 공간이 풀리고,
 * 다른 공간을 고르면 "나만 보기"가 풀린다.
 */
export function toggleShareSpace(current: readonly string[], spaceId: string, personalSpaceId: string): string[] {
  if (spaceId === personalSpaceId) {
    return current.includes(personalSpaceId) ? [] : [personalSpaceId];
  }
  const withoutPersonal = current.filter((id) => id !== personalSpaceId);
  return withoutPersonal.includes(spaceId)
    ? withoutPersonal.filter((id) => id !== spaceId)
    : [...withoutPersonal, spaceId];
}

export function isValidShare(spaceIds: readonly string[], mySpaces: MySpaces, personalSpaceId: string): boolean {
  if (spaceIds.length === 0) return false;
  if (new Set(spaceIds).size !== spaceIds.length) return false;
  if (spaceIds.includes(personalSpaceId) && spaceIds.length > 1) return false;
  return spaceIds.every((id) => mySpaces.includes(id));
}

/** 볼 수 있는 사람(계정 구성원) 이름 목록, 중복 제거 */
export function viewerNames(spaceIds: readonly string[], members: readonly Member[], personalSpaceId: string): string[] {
  if (spaceIds.length === 1 && spaceIds[0] === personalSpaceId) return [];
  const seen = new Map<string, string>();
  for (const m of members) {
    if (!spaceIds.includes(m.spaceId) || !m.uid) continue;
    if (!seen.has(m.uid)) seen.set(m.uid, m.displayName);
  }
  return [...seen.values()];
}

export function isAdmin(space: Pick<Space, 'adminUids'>, uid: string): boolean {
  return space.adminUids.includes(uid);
}

export function canEditItem(item: Pick<Item, 'ownerUid' | 'coEdit' | 'spaceIds'>, uid: string, mySpaces: MySpaces): boolean {
  if (item.ownerUid === uid) return true;
  return item.coEdit && canView(item, mySpaces);
}

export function canDeleteItem(item: Pick<Item, 'ownerUid'>, uid: string): boolean {
  return item.ownerUid === uid;
}

/** 공간 관리자는 자기 공간에서 항목을 뺄 수 있다 */
export function canRemoveItemFromSpace(
  item: Pick<Item, 'ownerUid' | 'spaceIds'>,
  space: Pick<Space, 'id' | 'adminUids'>,
  uid: string,
): boolean {
  if (!item.spaceIds.includes(space.id)) return false;
  return item.ownerUid === uid || isAdmin(space, uid);
}

export function canTrashPhoto(photo: Pick<Photo, 'ownerUid'>, uid: string): boolean {
  return photo.ownerUid === uid;
}

/** 관리자가 자기 공간에서 사진을 뺄 수 있는지 (공간 규칙 photoDelete) */
export function canRemovePhotoFromSpace(
  photo: Pick<Photo, 'ownerUid' | 'spaceIds'>,
  space: Pick<Space, 'id' | 'adminUids' | 'rules'>,
  uid: string,
): boolean {
  if (!photo.spaceIds.includes(space.id)) return false;
  if (photo.ownerUid === uid) return true;
  return space.rules.photoDelete === 'ownerOrAdmin' && isAdmin(space, uid);
}

/**
 * 중복 정리로 사본의 공유 범위를 원본에 합칠 때,
 * 원본 주인이 정하지 않은 공간에 새로 보이게 되는 공간 목록. 비어 있지 않으면 주인 확인이 필요하다.
 */
export function mergeNeedsOwnerApproval(
  keep: Pick<Photo, 'ownerUid' | 'spaceIds'>,
  removed: readonly Pick<Photo, 'ownerUid' | 'spaceIds'>[],
): string[] {
  const added = new Set<string>();
  for (const r of removed) {
    for (const id of r.spaceIds) if (!keep.spaceIds.includes(id)) added.add(id);
  }
  return [...added];
}
