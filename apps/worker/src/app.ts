// Hono 앱 조립: CORS, 의존성 주입, 인증, 오류 응답, 라우트
import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { type AuthUser, verifyFirebaseIdToken } from './auth/firebase-auth';
import { createDeps, type Deps } from './deps';
import type { Env } from './env';
import { HttpError, unauthorized } from './errors';
import { GoogleApiError } from './google/http';
import type { AppEnv, Mw } from './hono-env';
import { DocStoreError } from './repo/docstore';
import { authRoutes } from './routes/auth';
import { calendarRoutes } from './routes/calendar';
import { dedupeRoutes } from './routes/dedupe';
import { miscRoutes } from './routes/misc';
import { photoRoutes } from './routes/photos';
import { spaceRoutes } from './routes/spaces';

export interface AppOptions {
  makeDeps?: (env: Env, waitUntil?: (p: Promise<unknown>) => void) => Deps;
  verifyToken?: (token: string, deps: Deps) => Promise<AuthUser>;
}

const DEV_ORIGINS = ['http://localhost:8081', 'http://localhost:19006'];

export function allowedOrigin(origin: string, webOrigin: string): boolean {
  return origin === webOrigin.replace(/\/+$/, '') || DEV_ORIGINS.includes(origin);
}

export function createApp(opts: AppOptions = {}): Hono<AppEnv> {
  const makeDeps = opts.makeDeps ?? createDeps;
  const verify = opts.verifyToken ?? ((token: string, deps: Deps) => verifyFirebaseIdToken(token, deps.cfg.projectId));
  const app = new Hono<AppEnv>();

  app.use(
    '*',
    cors({
      origin: (origin, c) => (allowedOrigin(origin, (c.env as Env | undefined)?.WEB_ORIGIN ?? '') ? origin : null),
      allowHeaders: ['Authorization', 'Content-Type'],
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      maxAge: 86400,
    }),
  );

  app.use('*', async (c, next) => {
    let waitUntil: ((p: Promise<unknown>) => void) | undefined;
    try {
      const ctx = c.executionCtx;
      waitUntil = (p) => ctx.waitUntil(p);
    } catch {
      waitUntil = undefined; // 테스트 등 실행 컨텍스트가 없을 때
    }
    c.set('deps', makeDeps(c.env, waitUntil));
    await next();
  });

  const auth: Mw = async (c, next) => {
    const header = c.req.header('Authorization') ?? '';
    const m = /^Bearer\s+(.+)$/i.exec(header);
    if (!m) throw unauthorized('로그인이 필요해요');
    try {
      c.set('user', await verify(m[1]!.trim(), c.get('deps')));
    } catch {
      throw unauthorized();
    }
    await next();
  };

  authRoutes(app, auth);
  spaceRoutes(app, auth);
  photoRoutes(app, auth);
  dedupeRoutes(app, auth);
  calendarRoutes(app, auth);
  miscRoutes(app, auth);

  app.notFound((c) => c.json({ error: 'not_found', message: '요청한 주소를 찾을 수 없어요' }, 404));
  app.onError((err, c) => {
    if (err instanceof HttpError) {
      if (err.status >= 500) console.error(err.code, err.message, err.extra);
      return c.json({ ...(err.extra ?? {}), error: err.code, message: err.message }, err.status);
    }
    if (err instanceof DocStoreError || err instanceof GoogleApiError) {
      console.error('외부 서비스 오류', err);
      return c.json({ error: 'upstream_error', message: '잠시 후 다시 시도해 주세요' }, 502);
    }
    console.error('처리하지 못한 오류', err);
    return c.json({ error: 'internal', message: '잠시 후 다시 시도해 주세요' }, 500);
  });
  return app;
}
