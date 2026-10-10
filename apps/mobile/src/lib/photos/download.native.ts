// 안드로이드: 원본을 받아 폰 갤러리에 저장한다
import { Directory, File, Paths } from 'expo-file-system';
import { Asset, requestPermissionsAsync } from 'expo-media-library';

/** 서명 주소에 dl=1을 붙이면 Worker가 첨부 파일로 내려준다 */
export function downloadUrl(url: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}dl=1`;
}

export async function saveOriginal(url: string, fileName: string): Promise<string> {
  const perm = await requestPermissionsAsync(true);
  if (!perm.granted) throw new Error('사진을 저장하려면 권한이 필요해요');
  const dir = new Directory(Paths.cache, 'downloads');
  if (!dir.exists) dir.create({ intermediates: true });
  const safe = fileName.replace(/[\\/:*?"<>|]/g, '_') || 'photo.jpg';
  const file = await File.downloadFileAsync(downloadUrl(url), new File(dir, safe), { idempotent: true });
  try {
    await Asset.create(file.uri);
  } finally {
    try {
      file.delete();
    } catch {
      // 캐시 폴더라 남아도 괜찮다
    }
  }
  return '갤러리에 저장했어요';
}
