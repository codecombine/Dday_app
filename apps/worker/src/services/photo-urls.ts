// 사진 서명 주소 (명세서 17.2): `${API_ORIGIN}/b/<id>/<variant>?exp=<ms>&sig=<hex>`, 1시간 남짓 유효
import type { PhotoVariant } from '@hanjibung/core';

import { hmacHex, hmacVerifyHex } from '../util/crypto';
import { HOUR, MINUTE } from '../util/time';

const BUCKET = 15 * MINUTE;

/**
 * 만료 시각. 1시간 뒤를 15분 단위로 올림한다 → 같은 15분 안에 받은 주소는 똑같아서
 * 브라우저·앱 이미지 캐시가 그대로 맞는다 (유효 시간 60~75분).
 */
export function photoUrlExpiry(now: number): number {
  return Math.ceil((now + HOUR) / BUCKET) * BUCKET;
}

const message = (id: string, variant: PhotoVariant, exp: number) => `${id}/${variant}/${exp}`;

export async function signPhotoUrl(apiOrigin: string, key: string, id: string, variant: PhotoVariant, exp: number): Promise<string> {
  const sig = await hmacHex(key, message(id, variant, exp));
  return `${apiOrigin}/b/${encodeURIComponent(id)}/${variant}?exp=${exp}&sig=${sig}`;
}

export type UrlCheck = 'ok' | 'expired' | 'invalid';

export async function verifyPhotoUrl(
  key: string,
  id: string,
  variant: string,
  exp: string | undefined,
  sig: string | undefined,
  now: number,
): Promise<UrlCheck> {
  if (variant !== 'original' && variant !== 'preview' && variant !== 'thumb') return 'invalid';
  if (!exp || !/^\d{1,16}$/.test(exp) || !sig) return 'invalid';
  const expMs = Number(exp);
  if (!(await hmacVerifyHex(key, message(id, variant, expMs), sig))) return 'invalid';
  if (now > expMs) return 'expired';
  // 서명은 맞는데 만료가 너무 먼 미래 → 키가 새지 않았다면 생길 수 없다
  if (expMs - now > 2 * HOUR) return 'invalid';
  return 'ok';
}
