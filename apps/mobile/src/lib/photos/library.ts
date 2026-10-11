// 웹에는 폰 사진첩이 없다 (전체 가져오기는 파일·폴더 선택으로). 네이티브 구현은 library.native.ts
import type { LocalPhoto } from './types';

export interface Folder {
  id: string;
  title: string;
}

export interface AssetCursor {
  time: number;
  ids: string[];
}

export interface AssetRange {
  folderId: string | null;
  from: number | null;
  to: number | null;
}

export const libraryAvailable = false;

export async function ensureLibraryPermission(_ask = true): Promise<boolean> {
  return false;
}

export async function listFolders(): Promise<Folder[]> {
  return [];
}

export async function findFolder(_title: string | null): Promise<Folder | null> {
  return null;
}

export async function countAssets(_range: AssetRange): Promise<number> {
  return 0;
}

export async function nextAssets(_range: AssetRange, cursor: AssetCursor | null, _limit: number): Promise<{ assets: LocalPhoto[]; cursor: AssetCursor | null }> {
  return { assets: [], cursor };
}
