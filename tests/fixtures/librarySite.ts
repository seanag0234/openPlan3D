import { readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import * as list from '../../functions/api/library/index';
import * as deleted from '../../functions/api/library/deleted';
import * as plan from '../../functions/api/library/[id]';
import * as thumbnail from '../../functions/api/library/[id]/thumbnail';
import * as people from '../../functions/api/library/[id]/people';
import * as versions from '../../functions/api/library/[id]/versions';
import * as version from '../../functions/api/library/[id]/versions/[seq]';
import type { D1, D1Statement, Env } from '../../functions/api/library/_shared';

/** D1's prepare/bind/first/all/run/batch over an in-memory SQLite database with the library schema. */
export function memoryD1(): D1 & { db: DatabaseSync } {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../../functions/api/library/schema.sql', import.meta.url), 'utf8'));
  return {
    db,
    prepare(sql) {
      let values: SQLInputValue[] = [];
      const statement = {
        bind(...bound: unknown[]) { values = bound as SQLInputValue[]; return statement; },
        async first<T>() { return (db.prepare(sql).get(...values) ?? null) as T | null; },
        async all<T>() { return { results: db.prepare(sql).all(...values) as T[] }; },
        async run() { return { meta: { changes: Number(db.prepare(sql).run(...values).changes) } }; },
      };
      return statement;
    },
    async batch(statements: D1Statement[]) {
      db.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        db.exec('COMMIT');
        return results;
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
  };
}

/**
 * The site's library functions behind a fetch, without the sign-in middleware (tested on its own).
 * Setting `offline` makes every request fail the way a browser's fetch does with no signal.
 */
export function librarySite() {
  const library = memoryD1();
  const env: Env = { LIBRARY: library };
  const site = { offline: false, env, db: library.db, fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (site.offline) throw new TypeError('Failed to fetch');
    const { cache: _cache, ...rest } = init ?? {};
    const request = new Request(new URL(String(input), 'https://plans.example'), rest);
    const [id, part, seq] = new URL(request.url).pathname.split('/').slice(3).map(decodeURIComponent);
    const handlers: Record<string, unknown> = !id ? list : id === 'deleted' && !part ? deleted
      : part === 'thumbnail' ? thumbnail : part === 'people' ? people : part === 'versions' ? (seq ? version : versions) : plan;
    const handler = handlers[`onRequest${request.method[0]}${request.method.slice(1).toLowerCase()}`] as
      ((context: unknown) => Promise<Response>) | undefined;
    return handler ? handler({ request, env, params: { id, seq }, next: () => Promise.reject(new Error('no next')) }) : new Response(null, { status: 405 });
  }) as typeof fetch };
  return site;
}

