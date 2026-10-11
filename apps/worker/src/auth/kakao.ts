// 카카오 로그인: 인가 코드 교환, 사용자 정보 조회
import { type Fetcher, googleJson } from '../google/http';

export interface KakaoProfile {
  id: string;
  nickname: string | null;
  profileImage: string | null;
  email: string | null;
}

export interface KakaoApi {
  exchangeCode(code: string, redirectUri: string): Promise<string>;
  /** 앱이 보낸 액세스 토큰이 한지붕 카카오 앱에서 발급된 것인지 확인한다 (다른 앱 토큰이면 예외) */
  verifyToken(accessToken: string): Promise<void>;
  me(accessToken: string): Promise<KakaoProfile>;
}

export class KakaoClient implements KakaoApi {
  constructor(
    private readonly restApiKey: string,
    private readonly clientSecret: string | null,
    private readonly fetcher: Fetcher,
    /** 카카오 앱 ID. 비어 있으면 토큰의 앱 확인을 건너뛴다 */
    private readonly appId: string = '',
  ) {}

  async verifyToken(accessToken: string): Promise<void> {
    if (!this.appId) return;
    const r = await googleJson<{ app_id: number | string }>(this.fetcher, 'https://kapi.kakao.com/v1/user/access_token_info', { token: accessToken });
    if (String(r.app_id) !== this.appId) throw new Error(`다른 카카오 앱의 토큰 (app_id ${r.app_id})`);
  }

  async exchangeCode(code: string, redirectUri: string): Promise<string> {
    // googleJson은 OAuth 형식({error, error_description}) 오류도 해석한다
    const r = await googleJson<{ access_token: string }>(this.fetcher, 'https://kauth.kakao.com/oauth/token', {
      form: {
        grant_type: 'authorization_code',
        client_id: this.restApiKey,
        redirect_uri: redirectUri,
        code,
        ...(this.clientSecret ? { client_secret: this.clientSecret } : {}),
      },
    });
    return r.access_token;
  }

  async me(accessToken: string): Promise<KakaoProfile> {
    const r = await googleJson<{
      id: number | string;
      properties?: { nickname?: string; profile_image?: string };
      kakao_account?: { profile?: { nickname?: string; profile_image_url?: string }; email?: string };
    }>(this.fetcher, 'https://kapi.kakao.com/v2/user/me', { token: accessToken });
    const profile = r.kakao_account?.profile;
    return {
      id: String(r.id),
      nickname: profile?.nickname ?? r.properties?.nickname ?? null,
      profileImage: profile?.profile_image_url ?? r.properties?.profile_image ?? null,
      email: r.kakao_account?.email ?? null,
    };
  }
}
