// 안드로이드: 갤러리에서 여러 장 고르기 (EXIF 포함, 원본 화질, 편집 없음)
import * as ImagePicker from 'expo-image-picker';

import type { LocalPhoto } from './types';

const baseName = (uri: string) => decodeURIComponent(uri.split('/').pop()?.split('?')[0] ?? 'photo.jpg');

export function filesToLocal(_files: unknown): LocalPhoto[] {
  return [];
}

export async function pickPhotos(_opts: { directory?: boolean } = {}): Promise<LocalPhoto[]> {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: 0,
    exif: true,
    quality: 1,
    allowsEditing: false,
  });
  if (res.canceled) return [];
  return res.assets.map((a, i) => ({
    key: a.assetId ?? `${a.uri}-${i}`,
    uri: a.uri,
    name: a.fileName ?? baseName(a.uri),
    mime: a.mimeType ?? 'image/jpeg',
    bytes: a.fileSize ?? 0,
    width: a.width,
    height: a.height,
    exif: a.exif ?? null,
    assetId: a.assetId ?? null,
  }));
}

export const canPickDirectory = false;

export function releaseLocal(_list: LocalPhoto[]): void {}
