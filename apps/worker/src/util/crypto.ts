// HMAC 서명, AES-GCM 토큰 암호화, 무작위 ID (WebCrypto)
import { b64ToBytes, b64urlToBytes, bytesToB64url, bytesToHex, hexToBytes, utf8, utf8Decoder } from './base64';

const hmacKeys = new Map<string, Promise<CryptoKey>>();

function hmacKey(secret: string): Promise<CryptoKey> {
  let k = hmacKeys.get(secret);
  if (!k) {
    k = crypto.subtle.importKey('raw', utf8.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
    hmacKeys.set(secret, k);
  }
  return k;
}

export async function hmacHex(secret: string, message: string): Promise<string> {
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), utf8.encode(message));
  return bytesToHex(new Uint8Array(sig));
}

/** 상수 시간 비교 (subtle.verify) */
export async function hmacVerifyHex(secret: string, message: string, sigHex: string): Promise<boolean> {
  const sig = hexToBytes(sigHex);
  if (!sig || sig.length !== 32) return false;
  return crypto.subtle.verify('HMAC', await hmacKey(secret), sig, utf8.encode(message));
}

export async function sha256Hex(s: string): Promise<string> {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', utf8.encode(s))));
}

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/** Firestore 자동 ID와 같은 모양 (영숫자 20자) */
export function randomId(length = 20): string {
  let out = '';
  while (out.length < length) {
    const buf = crypto.getRandomValues(new Uint8Array(length * 2));
    for (const b of buf) {
      if (b < 248 && out.length < length) out += BASE62[b % 62];
    }
  }
  return out;
}

/** 초대 토큰 등 URL에 넣는 무작위 문자열 */
export function randomToken(bytes = 24): string {
  return bytesToB64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

// ── AES-GCM (구글 갱신 토큰 보관용) ───────────────────

const aesKeys = new Map<string, Promise<CryptoKey>>();

function aesKey(keyB64: string): Promise<CryptoKey> {
  let k = aesKeys.get(keyB64);
  if (!k) {
    const raw = b64ToBytes(keyB64.trim());
    if (raw.length !== 32) throw new Error('TOKEN_ENC_KEY는 32바이트(base64)여야 합니다');
    k = crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    aesKeys.set(keyB64, k);
  }
  return k;
}

/** 'v1.<iv>.<암호문>' (base64url) */
export async function encryptToken(plain: string, keyB64: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(keyB64), utf8.encode(plain));
  return `v1.${bytesToB64url(iv)}.${bytesToB64url(new Uint8Array(ct))}`;
}

export async function decryptToken(enc: string, keyB64: string): Promise<string> {
  const [v, ivPart, ctPart] = enc.split('.');
  if (v !== 'v1' || !ivPart || !ctPart) throw new Error('암호문 형식이 올바르지 않습니다');
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64urlToBytes(ivPart) },
    await aesKey(keyB64),
    b64urlToBytes(ctPart),
  );
  return utf8Decoder.decode(pt);
}
