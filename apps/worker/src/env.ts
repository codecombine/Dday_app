// Worker 바인딩·환경 변수·비밀값
export interface Env {
  DB: D1Database;
  PHOTOS: R2Bucket;

  // [vars]
  FIREBASE_PROJECT_ID: string;
  WEB_ORIGIN: string;
  API_ORIGIN: string;
  GOOGLE_CLIENT_ID: string;
  KAKAO_REST_API_KEY: string;
  BLOB_BACKEND?: string;
  DEDUPE_COPY_MAX_DISTANCE?: string;
  DEDUPE_SIMILAR_MAX_DISTANCE?: string;
  DEDUPE_RESOLUTION_RATIO?: string;
  CALENDAR_SYNC_BUDGET?: string;

  // 비밀값 (wrangler secret put)
  FIREBASE_SERVICE_ACCOUNT?: string;
  GOOGLE_CLIENT_SECRET?: string;
  KAKAO_CLIENT_SECRET?: string;
  TOKEN_ENC_KEY?: string;
  URL_SIGNING_KEY?: string;
  GOOGLE_WEBHOOK_SECRET?: string;
}
