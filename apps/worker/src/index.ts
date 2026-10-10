// 한지붕 API Worker 진입점
import { createApp } from './app';
import { createDeps } from './deps';
import type { Env } from './env';
import { runScheduled } from './services/scheduled';

const app = createApp();

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const deps = createDeps(env, (p) => ctx.waitUntil(p));
    await runScheduled(deps);
  },
} satisfies ExportedHandler<Env>;
