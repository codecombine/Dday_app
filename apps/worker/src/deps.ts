// 서비스가 쓰는 외부 의존성 묶음. 운영은 createDeps(env), 테스트는 가짜를 넣는다.
import { type KakaoApi, KakaoClient } from './auth/kakao';
import { type AppConfig, loadConfig } from './config';
import type { Env } from './env';
import { type GoogleApi, GoogleCalendarClient } from './google/calendar';
import { FcmClient, type PushSender } from './google/fcm';
import { FirestoreClient } from './google/firestore';
import { defaultFetcher } from './google/http';
import { type AuthAdmin, IdentityToolkit } from './google/identity';
import { parseServiceAccount, type ServiceAccount, serviceAccountToken } from './google/service-account';
import type { DocStore } from './repo/docstore';
import { D1IndexStore, type IndexStore } from './repo/index-store';
import { type BlobStore, createBlobStore } from './storage/blob-store';

export interface Deps {
  cfg: AppConfig;
  now(): number;
  docs: DocStore;
  index: IndexStore;
  blobs: BlobStore;
  auth: AuthAdmin;
  push: PushSender;
  google: GoogleApi;
  kakao: KakaoApi;
  serviceAccount(): ServiceAccount;
  /** 응답 뒤에 이어서 할 일 (ctx.waitUntil) */
  defer(task: Promise<unknown>): void;
}

let saCache: { json: string; sa: ServiceAccount } | null = null;

export function createDeps(env: Env, waitUntil?: (p: Promise<unknown>) => void): Deps {
  const cfg = loadConfig(env);
  const serviceAccount = (): ServiceAccount => {
    const raw = cfg.secret('FIREBASE_SERVICE_ACCOUNT');
    if (saCache?.json !== raw) saCache = { json: raw, sa: parseServiceAccount(raw) };
    return saCache.sa;
  };
  const saToken = () => serviceAccountToken(serviceAccount(), defaultFetcher);
  return {
    cfg,
    now: () => Date.now(),
    docs: new FirestoreClient(cfg.projectId, saToken, defaultFetcher),
    index: new D1IndexStore(env.DB),
    blobs: createBlobStore(env),
    auth: new IdentityToolkit(cfg.projectId, saToken, defaultFetcher),
    push: new FcmClient(cfg.projectId, saToken, defaultFetcher),
    google: new GoogleCalendarClient(cfg.googleClientId, () => cfg.secret('GOOGLE_CLIENT_SECRET'), defaultFetcher),
    kakao: new KakaoClient(cfg.kakaoRestApiKey, cfg.optionalSecret('KAKAO_CLIENT_SECRET'), defaultFetcher),
    serviceAccount,
    defer: (task) => {
      const safe = task.catch((e: unknown) => console.error('백그라운드 작업 실패', e));
      if (waitUntil) waitUntil(safe);
    },
  };
}
