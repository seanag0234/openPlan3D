import { unpack, versionStatements } from '../../_history';
import { status, type Context } from '../../_shared';

async function version({ env, params }: Context<'id' | 'seq'>) {
  const row = await env.LIBRARY.prepare('SELECT body FROM versions WHERE project_id = ? AND seq = ? AND body IS NOT NULL')
    .bind(params.id, Number(params.seq)).first<{ body: string }>();
  return row ? unpack(env.LIBRARY, row.body) : undefined;
}

/** One logged save, as the plan it was. */
export async function onRequestGet(context: Context<'id' | 'seq'>) {
  const body = await version(context);
  if (body === undefined) return status(404, 'No such version');
  if (body === null) return status(500, 'A picture this version uses is missing');
  return new Response(body, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

/** Bring a deleted plan back as this version. Refused while the plan exists: an open plan is restored in the editor. */
export async function onRequestPost(context: Context<'id' | 'seq'>) {
  const { env, params } = context;
  const body = await version(context);
  if (body === undefined) return status(404, 'No such version');
  if (body === null) return status(500, 'A picture this version uses is missing');
  const last = await env.LIBRARY.prepare('SELECT MAX(revision) AS revision, (SELECT name FROM versions WHERE seq = ?) AS name FROM versions WHERE project_id = ?')
    .bind(Number(params.seq), params.id).first<{ revision: number; name: string }>();
  const revision = (last?.revision ?? 0) + 1;
  const [{ meta }] = await env.LIBRARY.batch([
    env.LIBRARY.prepare('INSERT INTO projects (id, name, updated_at, revision, body) VALUES (?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING')
      .bind(params.id, last?.name ?? '', new Date().toISOString(), revision, body),
    ...await versionStatements(env.LIBRARY, params.id, revision, body),
  ]);
  return meta.changes ? status(204) : status(409, 'This plan is in the library already');
}

