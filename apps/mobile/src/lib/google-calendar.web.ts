// 웹: Google Identity Services 코드 클라이언트(팝업)로 인가 코드를 받아 Worker에 넘긴다 (명세서 10장)
import type { GoogleConnectRequest, GoogleStatus } from '@hanjibung/core';

import type { Backend } from '@/lib/backend';
import { config } from '@/lib/config';

export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.app.created';

interface CodeResponse {
  code?: string;
  error?: string;
  error_description?: string;
}
interface GoogleOAuth2 {
  initCodeClient(cfg: {
    client_id: string;
    scope: string;
    ux_mode: 'popup';
    callback: (r: CodeResponse) => void;
    error_callback?: (e: { type: string; message?: string }) => void;
  }): { requestCode(): void };
}
declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GoogleOAuth2 } };
  }
}

let loading: Promise<void> | null = null;

function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      reject(new Error('Google 로그인 스크립트를 불러오지 못했어요'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

function requestCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    const oauth2 = window.google?.accounts?.oauth2;
    if (!oauth2) return reject(new Error('Google 로그인을 쓸 수 없어요'));
    const client = oauth2.initCodeClient({
      client_id: config.googleWebClientId,
      scope: CALENDAR_SCOPE,
      ux_mode: 'popup',
      callback: (r) => (r.code ? resolve(r.code) : reject(new Error(r.error_description || '연결을 취소했어요'))),
      error_callback: (e) => reject(new Error(e.type === 'popup_closed' ? '연결을 취소했어요' : e.message || '연결하지 못했어요')),
    });
    client.requestCode();
  });
}

/** Google 캘린더 연결: 동의 화면 → 코드 → POST /calendar/google/connect */
export async function connectGoogleCalendar(backend: Backend, mirrorSpaceIds: string[]): Promise<GoogleStatus> {
  let code = 'demo';
  if (backend.kind !== 'demo') {
    if (!config.googleWebClientId) throw new Error('Google 클라이언트 ID가 설정되지 않았어요 (EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID)');
    await loadGis();
    code = await requestCode();
  }
  const body: GoogleConnectRequest = { code, redirectUri: 'postmessage', mirrorSpaceIds };
  return backend.api<GoogleStatus>('POST', '/calendar/google/connect', body);
}
