import { caller, roleOf } from '../_people';
import { status, type Context } from '../_shared';

export const VERSIONS_PAGE = 100;

/** A plan's logged saves and deletes, newest first, VERSIONS_PAGE at a time; `?before=<seq>` gives the next page. */
export async function onRequestGet({ request, env, params }: Context<'id'>) {
  if (!await roleOf(env.LIBRARY, params.id, caller(request))) return status(404, 'No such plan');
  const before = Number(new URL(request.url).searchParams.get('before'));
  const { results } = await env.LIBRARY
    .prepare('SELECT seq, revision, saved_at AS savedAt, name, body IS NULL AS deleted FROM versions WHERE project_id = ? AND seq < ? ORDER BY seq DESC LIMIT ?')
    .bind(params.id, Number.isSafeInteger(before) && before > 0 ? before : Number.MAX_SAFE_INTEGER, VERSIONS_PAGE)
    .all<{ seq: number; revision: number; savedAt: string; name: string; deleted: number }>();
  return Response.json(results.map(row => ({ ...row, deleted: row.deleted === 1 })), { headers: { 'Cache-Control': 'no-store' } });
}

