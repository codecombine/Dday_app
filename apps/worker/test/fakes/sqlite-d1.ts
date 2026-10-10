// D1Database 가짜: Node 내장 SQLite(:memory:)에 실제 마이그레이션 SQL을 적용해 쓴다
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const MIGRATION = fileURLToPath(new URL('../../migrations/0001_init.sql', import.meta.url).href);

class Stmt {
  constructor(
    private readonly db: DatabaseSync,
    readonly sql: string,
    readonly params: unknown[] = [],
  ) {}

  bind(...params: unknown[]): Stmt {
    for (const p of params) {
      if (p === undefined) throw new Error(`D1에는 undefined를 바인딩할 수 없습니다: ${this.sql}`);
      if (typeof p === 'boolean') throw new Error(`D1 불리언 바인딩 대신 0/1을 쓰세요: ${this.sql}`);
    }
    return new Stmt(this.db, this.sql, params);
  }

  private args(): (string | number | null)[] {
    return this.params as (string | number | null)[];
  }

  runSync(): { success: true; meta: { changes: number } } {
    const r = this.db.prepare(this.sql).run(...this.args());
    return { success: true, meta: { changes: Number(r.changes) } };
  }

  async all<T>(): Promise<{ results: T[]; success: true; meta: Record<string, unknown> }> {
    const rows = this.db.prepare(this.sql).all(...this.args());
    return { results: rows.map((r) => ({ ...r })) as T[], success: true, meta: {} };
  }

  async first<T>(): Promise<T | null> {
    const r = this.db.prepare(this.sql).get(...this.args());
    return r ? ({ ...r } as T) : null;
  }

  async run(): Promise<{ success: true; meta: { changes: number } }> {
    return this.runSync();
  }
}

export class SqliteD1 {
  readonly db: DatabaseSync;

  constructor() {
    this.db = new DatabaseSync(':memory:');
    this.db.exec(readFileSync(MIGRATION, 'utf8'));
  }

  prepare(sql: string): Stmt {
    return new Stmt(this.db, sql);
  }

  async batch(stmts: Stmt[]): Promise<{ success: true; meta: { changes: number } }[]> {
    this.db.exec('BEGIN');
    try {
      const out = stmts.map((s) => s.runSync());
      this.db.exec('COMMIT');
      return out;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  async exec(sql: string): Promise<void> {
    this.db.exec(sql);
  }
}
