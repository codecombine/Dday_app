// 안드로이드: 카카오 SDK 로그인 (카카오톡 앱 또는 카카오 계정) → 액세스 토큰
import { initializeKakaoSDK } from '@react-native-kakao/core';
import { login, logout } from '@react-native-kakao/user';

import { config } from '../config';

export const KAKAO_REDIRECT_PATH = '/auth/kakao';

let initialized = false;

async function ensureInitialized() {
  if (!initialized) {
    await initializeKakaoSDK(config.kakaoNativeAppKey);
    initialized = true;
  }
}

export async function kakaoNativeLogin(): Promise<string | null> {
  await ensureInitialized();
  const token = await login();
  return token.accessToken;
}

/** 앱 로그아웃 때 카카오 로그인도 끝낸다 (카카오로 들어오지 않았으면 실패하므로 부르는 쪽에서 무시) */
export async function kakaoNativeLogout(): Promise<void> {
  await ensureInitialized();
  await logout();
}

export function kakaoRedirectUri(): string {
  return '';
}

export function startKakaoWebLogin(): void {
  // 네이티브에서는 쓰지 않는다
}
