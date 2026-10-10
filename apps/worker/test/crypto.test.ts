import { exportPKCS8, exportSPKI, generateKeyPair, importSPKI, jwtVerify, decodeProtectedHeader } from 'jose';
import { describe, expect, it } from 'vitest';

import { authUserFromPayload } from '../src/auth/firebase-auth';
import { CUSTOM_TOKEN_AUDIENCE, mintCustomToken } from '../src/auth/custom-token';
import { type ServiceAccount, serviceAccountToken, parseServiceAccount } from '../src/google/service-account';
import { photoUrlExpiry, signPhotoUrl, verifyPhotoUrl } from '../src/services/photo-urls';
import { decryptToken, encryptToken, hmacHex, hmacVerifyHex, randomId, randomToken } from '../src/util/crypto';
import { HOUR, MINUTE } from '../src/util/time';

async function throwawayServiceAccount(): Promise<{ sa: ServiceAccount; publicPem: string }> {
  const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
  return {
    sa: { project_id: 'demo', private_key_id: 'kid-1', private_key: await exportPKCS8(privateKey), client_email: 'svc@demo.iam.gserviceaccount.com' },
    publicPem: await exportSPKI(publicKey),
  };
}

describe('Firebase 맞춤 토큰', () => {
  it('RS256 서명, 정해진 iss/sub/aud/uid, 1시간 만료', async () => {
    const { sa, publicPem } = await throwawayServiceAccount();
    const now = Date.UTC(2026, 9, 10);
    const token = await mintCustomToken(sa, 'kakao:12345', { now });
    expect(decodeProtectedHeader(token)).toEqual({ alg: 'RS256', typ: 'JWT', kid: 'kid-1' });
    const { payload } = await jwtVerify(token, await importSPKI(publicPem, 'RS256'), {
      issuer: sa.client_email,
      subject: sa.client_email,
      audience: CUSTOM_TOKEN_AUDIENCE,
      currentDate: new Date(now + 1000),
    });
    expect(payload.uid).toBe('kakao:12345');
    expect(payload.iat).toBe(now / 1000);
    expect(payload.exp! - payload.iat!).toBe(3600);
  });

  it('uid가 비었거나 너무 길면 거부', async () => {
    const { sa } = await throwawayServiceAccount();
    await expect(mintCustomToken(sa, '')).rejects.toThrow();
    await expect(mintCustomToken(sa, 'x'.repeat(129))).rejects.toThrow();
  });

  it('서비스 계정 액세스 토큰: JWT bearer grant + 캐시', async () => {
    const { sa, publicPem } = await throwawayServiceAccount();
    const sa2 = { ...sa, client_email: `cache-${Math.random()}@demo.iam.gserviceaccount.com` };
    let calls = 0;
    let assertion = '';
    const fetcher = async (_url: string, init?: RequestInit) => {
      calls++;
      const form = new URLSearchParams(String(init?.body));
      expect(form.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
      assertion = form.get('assertion')!;
      return Response.json({ access_token: `at-${calls}`, expires_in: 3600 });
    };
    const now = Date.now();
    expect(await serviceAccountToken(sa2, fetcher, now)).toBe('at-1');
    expect(await serviceAccountToken(sa2, fetcher, now + 10 * MINUTE)).toBe('at-1');
    expect(calls).toBe(1);
    const { payload } = await jwtVerify(assertion, await importSPKI(publicPem, 'RS256'), { audience: 'https://oauth2.googleapis.com/token' });
    expect(String(payload.scope)).toContain('https://www.googleapis.com/auth/datastore');
    expect(String(payload.scope)).toContain('https://www.googleapis.com/auth/identitytoolkit');
    // 만료 5분 전이면 새로 받는다
    expect(await serviceAccountToken(sa2, fetcher, now + 56 * MINUTE)).toBe('at-2');
  });

  it('서비스 계정 JSON의 이스케이프된 줄바꿈을 고친다', () => {
    const sa = parseServiceAccount(JSON.stringify({ private_key: 'a\\nb', client_email: 'x@y' }));
    expect(sa.private_key).toBe('a\nb');
    expect(() => parseServiceAccount('{}')).toThrow();
  });
});

describe('ID 토큰 내용 읽기', () => {
  it('클레임 spaces와 로그인 수단', () => {
    const u = authUserFromPayload({ sub: 'kakao:1', spaces: ['personal_kakao:1', 'home', 3], name: '엄마', firebase: { sign_in_provider: 'custom' } });
    expect(u).toMatchObject({ uid: 'kakao:1', spaces: ['personal_kakao:1', 'home'], name: '엄마', provider: 'kakao' });
    expect(authUserFromPayload({ sub: 'g', firebase: { sign_in_provider: 'google.com' } }).provider).toBe('google');
    expect(authUserFromPayload({ sub: 'p', firebase: { sign_in_provider: 'password' } }).spaces).toEqual([]);
    expect(() => authUserFromPayload({})).toThrow();
  });
});

describe('AES-GCM 토큰 암호화', () => {
  const key = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));

  it('왕복', async () => {
    const enc = await encryptToken('1//refresh-token-값', key);
    expect(enc.startsWith('v1.')).toBe(true);
    expect(enc).not.toContain('refresh');
    expect(await decryptToken(enc, key)).toBe('1//refresh-token-값');
  });

  it('매번 다른 IV', async () => {
    expect(await encryptToken('same', key)).not.toBe(await encryptToken('same', key));
  });

  it('다른 키나 바뀐 암호문은 실패', async () => {
    const enc = await encryptToken('secret', key);
    const other = btoa(String.fromCharCode(...new Uint8Array(32)));
    await expect(decryptToken(enc, other)).rejects.toThrow();
    const parts = enc.split('.');
    const tampered = `${parts[0]}.${parts[1]}.${parts[2]!.slice(0, -2)}${parts[2]!.endsWith('A') ? 'BB' : 'AA'}`;
    await expect(decryptToken(tampered, key)).rejects.toThrow();
    await expect(decryptToken('nope', key)).rejects.toThrow();
  });

  it('키 길이가 틀리면 거부', async () => {
    await expect(encryptToken('x', btoa('short'))).rejects.toThrow();
  });
});

describe('HMAC·무작위 값', () => {
  it('HMAC 서명·검증', async () => {
    const sig = await hmacHex('k', 'msg');
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
    expect(await hmacVerifyHex('k', 'msg', sig)).toBe(true);
    expect(await hmacVerifyHex('k', 'msg2', sig)).toBe(false);
    expect(await hmacVerifyHex('k', 'msg', 'zz')).toBe(false);
  });

  it('ID와 토큰 형식', () => {
    expect(randomId()).toMatch(/^[0-9A-Za-z]{20}$/);
    expect(new Set(Array.from({ length: 100 }, () => randomId())).size).toBe(100);
    expect(randomToken()).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });
});

describe('사진 서명 주소', () => {
  const key = 'url-key';
  const api = 'https://api.test';
  const now = Date.UTC(2026, 9, 10, 3, 7);

  it('만료는 1시간 뒤를 15분 단위로 올림 (60~75분)', () => {
    const exp = photoUrlExpiry(now);
    expect(exp % (15 * MINUTE)).toBe(0);
    expect(exp - now).toBeGreaterThanOrEqual(HOUR);
    expect(exp - now).toBeLessThan(HOUR + 15 * MINUTE);
    expect(photoUrlExpiry(now + 60_000)).toBe(exp); // 같은 15분 안이면 같은 주소
  });

  it('서명한 주소는 통과, 만료·변조는 거부', async () => {
    const exp = photoUrlExpiry(now);
    const url = new URL(await signPhotoUrl(api, key, 'photo1', 'thumb', exp));
    expect(url.origin + url.pathname).toBe(`${api}/b/photo1/thumb`);
    const e = url.searchParams.get('exp')!;
    const s = url.searchParams.get('sig')!;
    expect(await verifyPhotoUrl(key, 'photo1', 'thumb', e, s, now)).toBe('ok');
    expect(await verifyPhotoUrl(key, 'photo1', 'thumb', e, s, exp + 1)).toBe('expired');
    expect(await verifyPhotoUrl(key, 'photo2', 'thumb', e, s, now)).toBe('invalid');
    expect(await verifyPhotoUrl(key, 'photo1', 'original', e, s, now)).toBe('invalid');
    expect(await verifyPhotoUrl(key, 'photo1', 'thumb', String(exp + 15 * MINUTE), s, now)).toBe('invalid');
    expect(await verifyPhotoUrl(key, 'photo1', 'thumb', e, s.replace(/^./, s[0] === 'a' ? 'b' : 'a'), now)).toBe('invalid');
    expect(await verifyPhotoUrl('other', 'photo1', 'thumb', e, s, now)).toBe('invalid');
    expect(await verifyPhotoUrl(key, 'photo1', 'thumb', undefined, s, now)).toBe('invalid');
    expect(await verifyPhotoUrl(key, 'photo1', 'bogus', e, s, now)).toBe('invalid');
  });

  it('너무 먼 만료는 거부', async () => {
    const far = now + 5 * HOUR;
    const url = new URL(await signPhotoUrl(api, key, 'p', 'original', far));
    expect(await verifyPhotoUrl(key, 'p', 'original', String(far), url.searchParams.get('sig')!, now)).toBe('invalid');
  });
});
