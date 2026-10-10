// 안드로이드: 구글 로그인(오프라인 접근)으로 서버 인가 코드를 받아 Worker에 넘긴다 (명세서 10장)
// 권한은 '앱이 만든 캘린더만'(calendar.app.created)만 요청한다.
import type { GoogleConnectRequest, GoogleStatus } from '@hanjibung/core';
import { GoogleSignin, isSuccessResponse } from '@react-native-google-signin/google-signin';

import type { Backend } from '@/lib/backend';
import { config } from '@/lib/config';

export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.app.created';

async function serverAuthCode(): Promise<string> {
  if (!config.googleWebClientId) throw new Error('Google 클라이언트 ID가 설정되지 않았어요 (EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID)');
  GoogleSignin.configure({
    webClientId: config.googleWebClientId,
    offlineAccess: true,
    forceCodeForRefreshToken: true,
    scopes: [CALENDAR_SCOPE],
  });
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    // 이미 구글로 로그인해 있으면 권한만 더하고, 아니면 계정을 고른다
    let res = GoogleSignin.getCurrentUser() ? await GoogleSignin.addScopes({ scopes: [CALENDAR_SCOPE] }) : null;
    if (!res || !isSuccessResponse(res) || !res.data.serverAuthCode) res = await GoogleSignin.signIn();
    if (!isSuccessResponse(res)) throw new Error('연결을 취소했어요');
    const code = res.data.serverAuthCode;
    if (!code) throw new Error('구글 인가 코드를 받지 못했어요');
    return code;
  } finally {
    // 앱 로그인용 설정으로 되돌린다 (로그인할 때 캘린더 권한을 묻지 않도록)
    GoogleSignin.configure({ webClientId: config.googleWebClientId });
  }
}

/** Google 캘린더 연결: 동의 화면 → 코드 → POST /calendar/google/connect */
export async function connectGoogleCalendar(backend: Backend, mirrorSpaceIds: string[]): Promise<GoogleStatus> {
  const code = backend.kind === 'demo' ? 'demo' : await serverAuthCode();
  const body: GoogleConnectRequest = { code, redirectUri: '', mirrorSpaceIds };
  return backend.api<GoogleStatus>('POST', '/calendar/google/connect', body);
}
