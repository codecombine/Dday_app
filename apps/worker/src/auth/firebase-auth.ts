// Firebase ID 토큰 검증 (securetoken JWKS, jose)
import type { AuthProvider } from '@hanjibung/core';
import { createRemoteJWKSet, type JWTPayload, jwtVerify } from 'jose';

export interface AuthUser {
  uid: string;
  /** 토큰의 맞춤 클레임 spaces (막 바뀐 직후에는 오래된 값일 수 있다) */
  spaces: string[];
  name: string | null;
  email: string | null;
  picture: string | null;
  provider: AuthProvider;
}

const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

// isolate 안에서 재사용 (Cache-Control에 맞춰 jose가 갱신)
const jwks = createRemoteJWKSet(new URL(JWKS_URL), { cacheMaxAge: 6 * 60 * 60 * 1000, cooldownDuration: 30_000 });

export function providerOf(uid: string, payload: JWTPayload): AuthProvider {
  if (uid.startsWith('kakao:')) return 'kakao';
  const fb = payload.firebase as { sign_in_provider?: string } | undefined;
  if (fb?.sign_in_provider === 'google.com') return 'google';
  return 'password';
}

export function authUserFromPayload(payload: JWTPayload): AuthUser {
  const uid = payload.sub;
  if (!uid || typeof uid !== 'string' || uid.length > 128) throw new Error('sub가 없습니다');
  const spaces = Array.isArray(payload.spaces) ? payload.spaces.filter((s): s is string => typeof s === 'string') : [];
  const s = (v: unknown) => (typeof v === 'string' && v ? v : null);
  return {
    uid,
    spaces,
    name: s(payload.name),
    email: s(payload.email),
    picture: s(payload.picture),
    provider: providerOf(uid, payload),
  };
}

export async function verifyFirebaseIdToken(token: string, projectId: string): Promise<AuthUser> {
  const { payload } = await jwtVerify(token, jwks, {
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
    algorithms: ['RS256'],
    clockTolerance: 60,
  });
  if (typeof payload.auth_time === 'number' && payload.auth_time * 1000 > Date.now() + 60_000) {
    throw new Error('auth_time이 미래입니다');
  }
  return authUserFromPayload(payload);
}
