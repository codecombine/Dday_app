// 안드로이드: 카카오 SDK 로그인 (카카오톡 앱 또는 카카오 계정) → 액세스 토큰
import { initializeKakaoSDK } from '@react-native-kakao/core';
import { login } from '@react-native-kakao/user';

import { config } from '../config';

export const KAKAO_REDIRECT_PATH = '/auth/kakao';

let initialized = false;

export async function kakaoNativeLogin(): Promise<string | null> {
  if (!initialized) {
    await initializeKakaoSDK(config.kakaoNativeAppKey);
    initialized = true;
  }
  const token = await login();
  return token.accessToken;
}

export function kakaoRedirectUri(): string {
  return '';
}

export function startKakaoWebLogin(): void {
  // 네이티브에서는 쓰지 않는다
}
