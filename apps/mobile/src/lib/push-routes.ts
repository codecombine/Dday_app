// 알림을 눌렀을 때 열 화면 (서버 푸시 data → 앱 경로). 웹·네이티브 공용
export type PushData = Record<string, unknown>;

/** FCM data는 문자열만 담을 수 있어 dataString(JSON)으로 올 때도 있다 */
export function normalizePushData(raw: unknown): PushData {
  if (!raw || typeof raw !== 'object') return {};
  const obj = raw as PushData;
  if (typeof obj.dataString === 'string') {
    try {
      return { ...obj, ...(JSON.parse(obj.dataString) as PushData) };
    } catch {
      return obj;
    }
  }
  if (obj.data && typeof obj.data === 'object') return { ...(obj.data as PushData), ...obj };
  return obj;
}

const s = (v: unknown) => (typeof v === 'string' && v ? v : null);

export function routeForPush(data: PushData): string | null {
  const itemId = s(data.itemId);
  switch (data.type) {
    case 'dedupe':
      return s(data.spaceId) ? `/dedupe/${data.spaceId}` : '/album';
    case 'merge-request':
      return '/merge-requests';
    case 'photos-changed':
      return s(data.photoId) ? `/photo/${data.photoId}` : '/album';
    case 'items-changed':
    case 'item':
    case 'reminder':
      return itemId ? `/item/${itemId}` : '/';
    default:
      return itemId ? `/item/${itemId}` : null;
  }
}
