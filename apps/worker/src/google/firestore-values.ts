// Firestore REST 값 인코딩·디코딩 (https://firebase.google.com/docs/firestore/reference/rest/v1/Value)
// 우리 모델의 타임스탬프는 epoch millis(number)라서 timestampValue는 읽을 때만 숫자로 바꾼다.

export type FsValue =
  | { nullValue: null }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number | string }
  | { stringValue: string }
  | { timestampValue: string }
  | { bytesValue: string }
  | { referenceValue: string }
  | { geoPointValue: { latitude?: number; longitude?: number } }
  | { arrayValue: { values?: FsValue[] } }
  | { mapValue: { fields?: Record<string, FsValue> } };

export type FsFields = Record<string, FsValue>;

export function encodeValue(v: unknown): FsValue {
  if (v === null || v === undefined) return { nullValue: null };
  switch (typeof v) {
    case 'boolean':
      return { booleanValue: v };
    case 'string':
      return { stringValue: v };
    case 'bigint':
      return { integerValue: v.toString() };
    case 'number':
      if (Number.isSafeInteger(v)) return { integerValue: String(v) };
      if (Number.isNaN(v)) return { doubleValue: 'NaN' };
      if (!Number.isFinite(v)) return { doubleValue: v > 0 ? 'Infinity' : '-Infinity' };
      return { doubleValue: v };
    case 'object': {
      if (v instanceof Date) return { timestampValue: v.toISOString() };
      if (Array.isArray(v)) {
        // Firestore 배열에는 undefined가 들어갈 수 없다 → null
        return v.length ? { arrayValue: { values: v.map((x) => encodeValue(x)) } } : { arrayValue: {} };
      }
      const fields = encodeFields(v as Record<string, unknown>);
      return Object.keys(fields).length ? { mapValue: { fields } } : { mapValue: {} };
    }
    default:
      throw new Error(`Firestore에 저장할 수 없는 값: ${typeof v}`);
  }
}

/** undefined 필드는 건너뛴다 */
export function encodeFields(obj: Record<string, unknown>): FsFields {
  const out: FsFields = {};
  for (const [k, val] of Object.entries(obj)) {
    if (val === undefined) continue;
    out[k] = encodeValue(val);
  }
  return out;
}

export function decodeValue(v: FsValue): unknown {
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('stringValue' in v) return v.stringValue;
  if ('timestampValue' in v) return Date.parse(v.timestampValue);
  if ('bytesValue' in v) return v.bytesValue;
  if ('referenceValue' in v) return v.referenceValue;
  if ('geoPointValue' in v) return { latitude: v.geoPointValue.latitude ?? 0, longitude: v.geoPointValue.longitude ?? 0 };
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(decodeValue);
  if ('mapValue' in v) return decodeFields(v.mapValue.fields);
  return null;
}

export function decodeFields(fields: FsFields | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!fields) return out;
  for (const [k, val] of Object.entries(fields)) out[k] = decodeValue(val);
  return out;
}

/** 필드 경로 한 조각. 영문·숫자·밑줄이 아니면 백틱으로 감싼다 */
export function quoteFieldPath(path: string): string {
  return path
    .split('.')
    .map((seg) => (/^[A-Za-z_][A-Za-z_0-9]*$/.test(seg) ? seg : '`' + seg.replace(/\\/g, '\\\\').replace(/`/g, '\\`') + '`'))
    .join('.');
}
