// Identity Toolkit (Firebase Auth 관리 REST): 맞춤 클레임, 사용자 조회·생성·삭제
import { type Fetcher, GoogleApiError, googleJson } from './http';

export interface AuthUserRecord {
  uid: string;
  displayName: string | null;
  email: string | null;
  customClaims: Record<string, unknown>;
}

/** Worker가 Firebase Auth에 하는 일 (테스트에서는 가짜로 바꾼다) */
export interface AuthAdmin {
  /** 맞춤 클레임 spaces만 바꾸고 다른 클레임은 그대로 둔다 */
  setSpacesClaim(uid: string, spaceIds: readonly string[]): Promise<void>;
  lookup(uid: string): Promise<AuthUserRecord | null>;
  /** 없으면 만든다(카카오 첫 로그인). 이름이 비어 있으면 채운다 */
  ensureUser(uid: string, profile: { displayName?: string | null; photoUrl?: string | null }): Promise<void>;
  deleteUser(uid: string): Promise<void>;
}

const BASE = 'https://identitytoolkit.googleapis.com/v1';

export class IdentityToolkit implements AuthAdmin {
  constructor(
    private readonly projectId: string,
    private readonly token: () => Promise<string>,
    private readonly fetcher: Fetcher,
  ) {}

  private url(op: string): string {
    return `${BASE}/projects/${this.projectId}/accounts${op}`;
  }

  async lookup(uid: string): Promise<AuthUserRecord | null> {
    const res = await googleJson<{
      users?: { localId: string; displayName?: string; email?: string; customAttributes?: string }[];
    }>(this.fetcher, this.url(':lookup'), { token: await this.token(), body: { localId: [uid] } });
    const u = res?.users?.[0];
    if (!u) return null;
    let claims: Record<string, unknown> = {};
    if (u.customAttributes) {
      try {
        claims = JSON.parse(u.customAttributes) as Record<string, unknown>;
      } catch {
        claims = {};
      }
    }
    return { uid: u.localId, displayName: u.displayName ?? null, email: u.email ?? null, customClaims: claims };
  }

  async setSpacesClaim(uid: string, spaceIds: readonly string[]): Promise<void> {
    const current = await this.lookup(uid);
    if (!current) return; // Auth 사용자가 없으면(삭제 중 등) 건너뛴다
    const claims = { ...current.customClaims, spaces: [...spaceIds] };
    const json = JSON.stringify(claims);
    if (json.length > 1000) throw new Error('맞춤 클레임이 1000바이트를 넘습니다');
    await googleJson(this.fetcher, this.url(':update'), {
      token: await this.token(),
      body: { localId: uid, customAttributes: json },
    });
  }

  async ensureUser(uid: string, profile: { displayName?: string | null; photoUrl?: string | null }): Promise<void> {
    const current = await this.lookup(uid);
    if (!current) {
      try {
        await googleJson(this.fetcher, this.url(''), {
          token: await this.token(),
          body: {
            localId: uid,
            ...(profile.displayName ? { displayName: profile.displayName } : {}),
            ...(profile.photoUrl ? { photoUrl: profile.photoUrl } : {}),
          },
        });
      } catch (e) {
        // 동시에 두 번 로그인한 경우
        if (!(e instanceof GoogleApiError && /DUPLICATE_LOCAL_ID|ALREADY_EXISTS/.test(`${e.reason} ${e.message}`))) throw e;
      }
      return;
    }
    if (!current.displayName && profile.displayName) {
      await googleJson(this.fetcher, this.url(':update'), {
        token: await this.token(),
        body: { localId: uid, displayName: profile.displayName },
      });
    }
  }

  async deleteUser(uid: string): Promise<void> {
    try {
      await googleJson(this.fetcher, this.url(':delete'), { token: await this.token(), body: { localId: uid } });
    } catch (e) {
      if (e instanceof GoogleApiError && /USER_NOT_FOUND/.test(e.message)) return;
      throw e;
    }
  }
}
