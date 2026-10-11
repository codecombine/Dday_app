// Google 캘린더 연결 (타입 기준 파일). 실제 구현은 google-calendar.web.ts(웹)·google-calendar.native.ts(안드로이드)
import type { GoogleStatus } from '@hanjibung/core';

import type { Backend } from '@/lib/backend';

export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.app.created';

export async function connectGoogleCalendar(_backend: Backend, _mirrorSpaceIds: string[]): Promise<GoogleStatus> {
  throw new Error('이 기기에서는 Google 캘린더를 연결할 수 없어요');
}
