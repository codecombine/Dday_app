// 환경 변수 → 앱 설정. 비밀값은 실제로 쓰는 순간에 확인한다 (없으면 500).
import { DEFAULT_THRESHOLDS, type DedupeThresholds } from '@hanjibung/core';

import type { Env } from './env';
import { HttpError } from './errors';

export interface AppConfig {
  projectId: string;
  webOrigin: string;
  apiOrigin: string;
  googleClientId: string;
  kakaoRestApiKey: string;
  kakaoAppId: string;
  thresholds: DedupeThresholds;
  calendarBudget: number;
  secret(name: SecretName): string;
  optionalSecret(name: SecretName): string | null;
}

export type SecretName =
  | 'FIREBASE_SERVICE_ACCOUNT'
  | 'GOOGLE_CLIENT_SECRET'
  | 'KAKAO_CLIENT_SECRET'
  | 'TOKEN_ENC_KEY'
  | 'URL_SIGNING_KEY'
  | 'GOOGLE_WEBHOOK_SECRET';

function num(v: string | undefined, fallback: number): number {
  const n = v === undefined || v === '' ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function loadConfig(env: Env): AppConfig {
  const trimSlash = (s: string) => s.replace(/\/+$/, '');
  return {
    projectId: env.FIREBASE_PROJECT_ID,
    webOrigin: trimSlash(env.WEB_ORIGIN),
    apiOrigin: trimSlash(env.API_ORIGIN),
    googleClientId: env.GOOGLE_CLIENT_ID ?? '',
    kakaoRestApiKey: env.KAKAO_REST_API_KEY ?? '',
    kakaoAppId: env.KAKAO_APP_ID ?? '',
    thresholds: {
      copyMaxDistance: num(env.DEDUPE_COPY_MAX_DISTANCE, DEFAULT_THRESHOLDS.copyMaxDistance),
      similarMaxDistance: num(env.DEDUPE_SIMILAR_MAX_DISTANCE, DEFAULT_THRESHOLDS.similarMaxDistance),
      resolutionRatio: num(env.DEDUPE_RESOLUTION_RATIO, DEFAULT_THRESHOLDS.resolutionRatio),
    },
    calendarBudget: Math.max(10, num(env.CALENDAR_SYNC_BUDGET, 150)),
    secret(name) {
      const v = env[name];
      if (!v) throw new HttpError(500, 'server_misconfigured', '서버 설정이 끝나지 않았어요', { missing: name });
      return v;
    },
    optionalSecret(name) {
      return env[name] || null;
    },
  };
}
