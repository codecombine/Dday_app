// 안드로이드 폰 사진첩 읽기 (자동 올리기·전체 가져오기). expo-media-library 새 API(Query) 사용
import { File } from 'expo-file-system';
import { Album, Asset, AssetField, getPermissionsAsync, MediaType, Query, requestPermissionsAsync } from 'expo-media-library';

import type { LocalPhoto } from './types';

export interface Folder {
  id: string;
  title: string;
}

/** 이어서 읽을 위치: 마지막으로 처리한 생성 시각과 그 시각의 사진 ID들 */
export interface AssetCursor {
  time: number;
  ids: string[];
}

export interface AssetRange {
  folderId: string | null;
  from: number | null;
  to: number | null;
}

export const libraryAvailable = true;

/**
 * 자동 올리기·전체 가져오기는 사진첩 전체가 필요하다. 안드로이드 14+의 "일부만 허용"은 granted로 오지만
 * 고른 사진만 보여서 새 사진을 영영 못 찾으므로, "모두 허용"일 때만 허용으로 본다.
 */
const hasFullAccess = (r: { granted: boolean; accessPrivileges?: 'all' | 'limited' | 'none' }) =>
  r.granted && (r.accessPrivileges ?? 'all') === 'all';

export async function ensureLibraryPermission(ask = true): Promise<boolean> {
  const cur = await getPermissionsAsync(false, ['photo']);
  if (hasFullAccess(cur)) return true;
  if (!ask || !cur.canAskAgain) return false;
  return hasFullAccess(await requestPermissionsAsync(false, ['photo']));
}

export async function listFolders(): Promise<Folder[]> {
  const albums = await Album.getAll();
  const out = await Promise.all(albums.map(async (a) => ({ id: a.id, title: await a.getTitle() })));
  return out.sort((a, b) => (a.title === 'Camera' ? -1 : b.title === 'Camera' ? 1 : a.title.localeCompare(b.title)));
}

/** 폴더 이름 → 폴더 (null이면 카메라 폴더) */
export async function findFolder(title: string | null): Promise<Folder | null> {
  const name = title ?? 'Camera';
  const album = await Album.get(name);
  return album ? { id: album.id, title: name } : null;
}

function baseQuery(range: AssetRange): Query {
  let q = new Query().eq(AssetField.MEDIA_TYPE, MediaType.IMAGE);
  if (range.folderId) q = q.album(new Album(range.folderId));
  if (range.from != null) q = q.gte(AssetField.CREATION_TIME, range.from);
  if (range.to != null) q = q.lte(AssetField.CREATION_TIME, range.to);
  return q;
}

export async function countAssets(range: AssetRange): Promise<number> {
  return (await baseQuery(range).exeForMetadata()).length;
}

const MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', heic: 'image/heic', heif: 'image/heif', webp: 'image/webp', gif: 'image/gif' };

/** 오래된 것부터 limit장. 다음 위치(cursor)를 함께 준다. 더 없으면 assets가 빈 배열 */
export async function nextAssets(range: AssetRange, cursor: AssetCursor | null, limit: number): Promise<{ assets: LocalPhoto[]; cursor: AssetCursor | null }> {
  const from = cursor ? Math.max(cursor.time, range.from ?? 0) : range.from;
  const skip = new Set(cursor?.ids ?? []);
  const metas = (
    await baseQuery({ ...range, from })
      .orderBy({ key: AssetField.CREATION_TIME, ascending: true })
      .limit(limit + skip.size)
      .exeForMetadata()
  )
    .filter((m) => !skip.has(m.id))
    .slice(0, limit);
  if (!metas.length) return { assets: [], cursor };

  const assets: LocalPhoto[] = [];
  for (const m of metas) {
    try {
      const asset = new Asset(m.id);
      const uri = await asset.getUri();
      const name = m.filename ?? decodeURIComponent(uri.split('/').pop() ?? 'photo.jpg');
      let exif: Record<string, unknown> | null = null;
      try {
        exif = await asset.getExif();
      } catch {
        exif = null;
      }
      let bytes = 0;
      try {
        bytes = new File(uri).size ?? 0;
      } catch {
        bytes = 0;
      }
      const ext = name.split('.').pop()?.toLowerCase() ?? 'jpg';
      assets.push({ key: m.id, uri, name, mime: MIME[ext] ?? 'image/jpeg', bytes, width: m.width ?? 0, height: m.height ?? 0, exif, assetId: m.id });
    } catch {
      // 읽을 수 없는 사진(클라우드 전용 등)은 건너뛴다
    }
  }
  const last = metas[metas.length - 1]!;
  const lastTime = last.creationTime ?? cursor?.time ?? 0;
  const sameTime = metas.filter((m) => (m.creationTime ?? 0) === lastTime).map((m) => m.id);
  const next: AssetCursor = { time: lastTime, ids: cursor && cursor.time === lastTime ? [...cursor.ids, ...sameTime] : sameTime };
  return { assets, cursor: next };
}
