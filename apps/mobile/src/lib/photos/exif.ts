// EXIF에서 촬영 일시·기기 이름·촬영 정보 유무를 뽑는다 (네이티브 사진첩과 웹 exifr 결과 모두)

/** "2026:09:25 14:02:11" 또는 Date → epoch millis. 시간대 정보가 있으면 반영, 없으면 기기 현지 시각 */
export function parseExifDate(value: unknown, offset?: unknown): number | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  if (typeof value !== 'string') return null;
  const m = /^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(value.trim());
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map((x) => Number(x ?? 0)) as number[];
  if (!y || y < 1900 || !mo || !d) return null;
  if (typeof offset === 'string' && /^[+-]\d{2}:\d{2}$/.test(offset)) {
    const sign = offset.startsWith('-') ? -1 : 1;
    const [oh, om] = offset.slice(1).split(':').map(Number) as [number, number];
    return Date.UTC(y, mo - 1, d, h ?? 0, mi ?? 0, s ?? 0) - sign * (oh * 60 + om) * 60_000;
  }
  const t = new Date(y, mo - 1, d, h ?? 0, mi ?? 0, s ?? 0).getTime();
  return Number.isNaN(t) ? null : t;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim().replace(/\0/g, '') : null);

export interface ExifSummary {
  hasExif: boolean;
  takenAt: number | null;
  cameraModel: string | null;
}

export function summarizeExif(exif: Record<string, unknown> | null | undefined): ExifSummary {
  if (!exif) return { hasExif: false, takenAt: null, cameraModel: null };
  // 안드로이드는 {Exif}·{TIFF} 묶음 없이 평평하게, iOS는 묶음 안에 준다
  const flat: Record<string, unknown> = { ...exif };
  for (const k of ['{Exif}', '{TIFF}']) {
    const inner = exif[k];
    if (inner && typeof inner === 'object') Object.assign(flat, inner as Record<string, unknown>);
  }
  const takenAt = parseExifDate(flat.DateTimeOriginal ?? flat.DateTimeDigitized ?? flat.CreateDate, flat.OffsetTimeOriginal ?? flat.OffsetTime);
  const make = str(flat.Make);
  const model = str(flat.Model);
  const cameraModel = model ? (make && !model.toLowerCase().startsWith(make.toLowerCase()) && !/samsung/i.test(make) ? `${make} ${model}` : model) : null;
  return { hasExif: !!(takenAt || make || model), takenAt, cameraModel };
}
