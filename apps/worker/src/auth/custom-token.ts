// Firebase 맞춤 토큰 발급 (카카오 로그인). 서비스 계정 키로 RS256 서명한다.
import { SignJWT } from 'jose';

import { type ServiceAccount, signingKey } from '../google/service-account';

export const CUSTOM_TOKEN_AUDIENCE =
  'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit';

export async function mintCustomToken(
  sa: ServiceAccount,
  uid: string,
  opts: { now?: number; claims?: Record<string, unknown> } = {},
): Promise<string> {
  if (!uid || uid.length > 128) throw new Error('uid는 1~128자여야 합니다');
  const iat = Math.floor((opts.now ?? Date.now()) / 1000);
  return new SignJWT({ uid, ...(opts.claims ? { claims: opts.claims } : {}) })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT', ...(sa.private_key_id ? { kid: sa.private_key_id } : {}) })
    .setIssuer(sa.client_email)
    .setSubject(sa.client_email)
    .setAudience(CUSTOM_TOKEN_AUDIENCE)
    .setIssuedAt(iat)
    .setExpirationTime(iat + 3600)
    .sign(await signingKey(sa));
}
