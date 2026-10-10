// 서비스 계정 → OAuth 액세스 토큰 (JWT bearer grant). Admin SDK 없이 REST로 쓴다.
import { importPKCS8, SignJWT } from 'jose';

import { type Fetcher, googleJson } from './http';

export interface ServiceAccount {
  project_id: string;
  private_key_id?: string;
  private_key: string;
  client_email: string;
}

export const SA_SCOPES = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/datastore',
  'https://www.googleapis.com/auth/firebase.messaging',
  'https://www.googleapis.com/auth/identitytoolkit',
];

const TOKEN_URL = 'https://oauth2.googleapis.com/token';

export function parseServiceAccount(json: string): ServiceAccount {
  let sa: Partial<ServiceAccount>;
  try {
    sa = JSON.parse(json) as Partial<ServiceAccount>;
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT가 JSON이 아닙니다');
  }
  if (!sa.private_key || !sa.client_email) throw new Error('서비스 계정 키에 private_key/client_email이 없습니다');
  return {
    project_id: sa.project_id ?? '',
    private_key_id: sa.private_key_id,
    // 환경 변수로 옮기면서 줄바꿈이 '\\n' 문자로 남는 경우가 있다
    private_key: sa.private_key.replace(/\\n/g, '\n'),
    client_email: sa.client_email,
  };
}

const keyCache = new Map<string, Promise<CryptoKey>>();

export function signingKey(sa: ServiceAccount): Promise<CryptoKey> {
  let k = keyCache.get(sa.private_key);
  if (!k) {
    k = importPKCS8(sa.private_key, 'RS256');
    keyCache.set(sa.private_key, k);
  }
  return k;
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

const tokenCache = new Map<string, CachedToken>();
const inflight = new Map<string, Promise<CachedToken>>();

/** 만료 5분 전까지 모듈 메모리에 캐시한다 (isolate 단위) */
export async function serviceAccountToken(sa: ServiceAccount, fetcher: Fetcher, now = Date.now()): Promise<string> {
  const cacheKey = sa.client_email;
  const hit = tokenCache.get(cacheKey);
  if (hit && hit.expiresAt - 5 * 60_000 > now) return hit.token;
  let p = inflight.get(cacheKey);
  if (!p) {
    p = (async () => {
      const iat = Math.floor(now / 1000);
      const assertion = await new SignJWT({ scope: SA_SCOPES.join(' ') })
        .setProtectedHeader({ alg: 'RS256', typ: 'JWT', ...(sa.private_key_id ? { kid: sa.private_key_id } : {}) })
        .setIssuer(sa.client_email)
        .setSubject(sa.client_email)
        .setAudience(TOKEN_URL)
        .setIssuedAt(iat)
        .setExpirationTime(iat + 3600)
        .sign(await signingKey(sa));
      const res = await googleJson<{ access_token: string; expires_in: number }>(fetcher, TOKEN_URL, {
        form: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion },
      });
      const t = { token: res.access_token, expiresAt: now + res.expires_in * 1000 };
      tokenCache.set(cacheKey, t);
      return t;
    })().finally(() => inflight.delete(cacheKey));
    inflight.set(cacheKey, p);
  }
  return (await p).token;
}
