// Hono 타입: 바인딩과 요청마다 넣는 값
import type { Context, MiddlewareHandler } from 'hono';

import type { AuthUser } from './auth/firebase-auth';
import type { Deps } from './deps';
import type { Env } from './env';

export interface AppEnv {
  Bindings: Env;
  Variables: { deps: Deps; user: AuthUser };
}

export type Ctx = Context<AppEnv>;
export type Mw = MiddlewareHandler<AppEnv>;
