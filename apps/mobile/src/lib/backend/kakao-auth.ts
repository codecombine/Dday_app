// 웹: 카카오 로그인 페이지로 이동 → /auth/kakao 로 돌아와 인가 코드를 서버에 넘긴다
import { config } from '../config';

export const KAKAO_REDIRECT_PATH = '/auth/kakao';

/** 웹에는 네이티브 로그인이 없으므로 null */
export async function kakaoNativeLogin(): Promise<string | null> {
  return null;
}

export function kakaoRedirectUri(): string {
  return `${window.location.origin}${KAKAO_REDIRECT_PATH}`;
}

export function startKakaoWebLogin(): void {
  const params = new URLSearchParams({
    client_id: config.kakaoRestApiKey,
    redirect_uri: kakaoRedirectUri(),
    response_type: 'code',
  });
  window.location.assign(`https://kauth.kakao.com/oauth/authorize?${params.toString()}`);
}

/** 웹 카카오 로그인은 인가 코드만 쓰고 세션을 남기지 않는다 */
export async function kakaoNativeLogout(): Promise<void> {}
