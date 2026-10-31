// 앱 설치 안내 (/install): APK 주소, 지금 브라우저가 어떤 기기인지, 최신 버전 정보.
// APK는 GitHub 릴리스에 항상 같은 이름(hanjibung.apk)으로 올리므로 latest 주소가 늘 새 버전을 가리킨다.
import { Platform } from 'react-native';

const REPO = 'codecombine/Dday_app';
export const APK_URL = `https://github.com/${REPO}/releases/latest/download/hanjibung.apk`;
const LATEST_RELEASE_API = `https://api.github.com/repos/${REPO}/releases/latest`;

const isWeb = Platform.OS === 'web';
const ua = isWeb && typeof navigator !== 'undefined' ? navigator.userAgent : '';

/** 웹에서 열었을 때의 기기·브라우저 (앱에서는 모두 false) */
export const webDevice = {
  android: /Android/i.test(ua),
  ios: /iPhone|iPad|iPod/i.test(ua),
  kakaotalk: /KAKAOTALK/i.test(ua),
};

/** 홈 화면에 추가해 앱처럼 연 웹인지 (아이폰 안내를 다시 보여주지 않으려고) */
export function isStandaloneWeb(): boolean {
  if (!isWeb || typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}

/** 설치를 권할 대상: 안드로이드 폰 웹이면 'android', 홈 화면에 아직 안 넣은 아이폰 웹이면 'ios' */
export function installTarget(): 'android' | 'ios' | null {
  if (!isWeb) return null;
  if (webDevice.android) return 'android';
  if (webDevice.ios && !isStandaloneWeb()) return 'ios';
  return null;
}

/** 지금 페이지를 카카오톡 안 브라우저 대신 기본 브라우저로 연다 (카카오톡 안에서는 파일 받기가 잘 안 됨) */
export function openOutsideKakao(url: string) {
  window.location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(url)}`;
}

/** APK 받기. 같은 창에서 열어야 카카오톡·팝업 차단에 덜 걸린다 */
export function downloadApk() {
  window.location.href = APK_URL;
}

export interface LatestRelease {
  version: string;
  sizeMB: number | null;
}

/** GitHub에 올린 최신 버전과 APK 크기. 못 받으면 null (안내는 그대로 보여준다) */
export async function fetchLatestRelease(): Promise<LatestRelease | null> {
  try {
    const res = await fetch(LATEST_RELEASE_API, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) return null;
    const body = (await res.json()) as { tag_name?: string; assets?: { name: string; size: number }[] };
    if (!body.tag_name) return null;
    const apk = body.assets?.find((a) => a.name === 'hanjibung.apk');
    return { version: body.tag_name.replace(/^v/, ''), sizeMB: apk ? Math.round(apk.size / 1_000_000) : null };
  } catch {
    return null;
  }
}
