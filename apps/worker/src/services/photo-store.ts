// 사진 문서(Firestore)와 지문 색인(D1)을 함께 바꾸는 저수준 함수.
// 클라이언트는 photos/*를 직접 쓰지 않는다 → 공유 범위·상태 변경은 모두 여기를 거친다.
import type { Photo } from '@hanjibung/core';

import type { Deps } from '../deps';
import { P, type Write } from '../repo/docstore';
import type { PhotoIndexPatch } from '../repo/index-store';
import { PHOTO_VARIANTS, photoBlobKey } from '../storage/blob-store';

export type PhotoPatch = Partial<
  Pick<Photo, 'spaceIds' | 'albumIds' | 'ownerUid' | 'takenAt' | 'status' | 'trashedAt' | 'trashedBy' | 'bytes'>
>;

function indexPatch(p: PhotoPatch): PhotoIndexPatch {
  const out: PhotoIndexPatch = {};
  if (p.spaceIds !== undefined) out.spaceIds = p.spaceIds;
  if (p.ownerUid !== undefined) out.ownerUid = p.ownerUid;
  if (p.takenAt !== undefined) out.takenAt = p.takenAt;
  if (p.status !== undefined) out.status = p.status;
  if (p.trashedAt !== undefined) out.trashedAt = p.trashedAt;
  if (p.bytes !== undefined) out.bytes = p.bytes;
  return out;
}

/** 여러 사진을 한 번에 바꾼다 (Firestore는 한 번의 commit) */
export async function patchPhotos(deps: Deps, patches: readonly { id: string; patch: PhotoPatch }[]): Promise<void> {
  const list = patches.filter((p) => Object.keys(p.patch).length > 0);
  if (!list.length) return;
  const writes: Write[] = list.map((p) => ({ op: 'update', path: P.photo(p.id), data: p.patch }));
  await deps.docs.commit(writes);
  for (const p of list) {
    const ip = indexPatch(p.patch);
    if (Object.keys(ip).length) await deps.index.updatePhoto(p.id, ip);
  }
}

export function patchPhoto(deps: Deps, id: string, patch: PhotoPatch): Promise<void> {
  return patchPhotos(deps, [{ id, patch }]);
}

export function trashPhotos(deps: Deps, ids: readonly string[], byUid: string): Promise<void> {
  const now = deps.now();
  return patchPhotos(
    deps,
    ids.map((id) => ({ id, patch: { status: 'trashed', trashedAt: now, trashedBy: byUid } })),
  );
}

/** 완전히 지운다: 파일 3종 + Firestore 문서 + D1 행, 앨범 표지 정리 */
export async function hardDeletePhoto(deps: Deps, id: string): Promise<void> {
  for (const v of PHOTO_VARIANTS) await deps.blobs.delete(photoBlobKey(id, v));
  const covers = await deps.docs.query<{ coverPhotoId?: string }>('albums', {
    where: [{ field: 'coverPhotoId', op: 'EQUAL', value: id }],
  });
  await deps.docs.commit([
    { op: 'delete', path: P.photo(id) },
    ...covers.map((a): Write => ({ op: 'update', path: a.path, data: { coverPhotoId: null } })),
  ]);
  await deps.index.deletePhoto(id);
}
