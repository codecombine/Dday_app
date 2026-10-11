// 요청 본문 검사 (가벼운 수작업 검증)
import type { Context } from 'hono';

import { badRequest } from '../errors';

export type Obj = Record<string, unknown>;

export async function readJson(c: Context, optional = false): Promise<Obj> {
  const text = await c.req.text();
  if (!text.trim()) {
    if (optional) return {};
    throw badRequest();
  }
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    throw badRequest();
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw badRequest();
  return v as Obj;
}

const invalid = (field: string) => badRequest('요청 형식이 올바르지 않아요', 'invalid_field', { field });

export function str(o: Obj, key: string, opts: { min?: number; max?: number; trim?: boolean } = {}): string {
  const v = o[key];
  if (typeof v !== 'string') throw invalid(key);
  const s = opts.trim === false ? v : v.trim();
  if (s.length < (opts.min ?? 1) || s.length > (opts.max ?? 500)) throw invalid(key);
  return s;
}

export function optStr(o: Obj, key: string, opts: { min?: number; max?: number; trim?: boolean } = {}): string | undefined {
  if (o[key] === undefined || o[key] === null) return undefined;
  return str(o, key, opts);
}

export function strOrNull(o: Obj, key: string, max = 500): string | null {
  const v = o[key];
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string' || v.length > max) throw invalid(key);
  return v;
}

export function bool(o: Obj, key: string, fallback?: boolean): boolean {
  const v = o[key];
  if (v === undefined && fallback !== undefined) return fallback;
  if (typeof v !== 'boolean') throw invalid(key);
  return v;
}

export function int(o: Obj, key: string, opts: { min?: number; max?: number } = {}): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isSafeInteger(v)) throw invalid(key);
  if (v < (opts.min ?? 0) || v > (opts.max ?? Number.MAX_SAFE_INTEGER)) throw invalid(key);
  return v;
}

export function intOrNull(o: Obj, key: string, opts: { min?: number; max?: number } = {}): number | null {
  if (o[key] === undefined || o[key] === null) return null;
  return int(o, key, opts);
}

export function strArray(o: Obj, key: string, opts: { max?: number; itemMax?: number; optional?: boolean } = {}): string[] {
  const v = o[key];
  if (v === undefined && opts.optional) return [];
  if (!Array.isArray(v) || v.length > (opts.max ?? 50)) throw invalid(key);
  const out: string[] = [];
  for (const x of v) {
    if (typeof x !== 'string' || !x || x.length > (opts.itemMax ?? 200)) throw invalid(key);
    if (!out.includes(x)) out.push(x);
  }
  return out;
}

export function oneOf<T extends string>(o: Obj, key: string, values: readonly T[]): T {
  const v = o[key];
  if (typeof v !== 'string' || !values.includes(v as T)) throw invalid(key);
  return v as T;
}

export function optOneOf<T extends string>(o: Obj, key: string, values: readonly T[]): T | undefined {
  if (o[key] === undefined || o[key] === null) return undefined;
  return oneOf(o, key, values);
}

/** 문서 ID로 쓸 수 있는 문자열인지 (경로 조작 방지) */
export function isSafeId(id: string): boolean {
  return /^[A-Za-z0-9_:.\-]{1,128}$/.test(id) && id !== '.' && id !== '..';
}

export function safeId(id: string | undefined, field = 'id'): string {
  if (!id || !isSafeId(id)) throw invalid(field);
  return id;
}
