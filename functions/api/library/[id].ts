import { deleteStatement, versionStatements } from './_history';
import { caller, roleOf } from './_people';
import { MAX_PLAN_BYTES, etag, matchedRevision, readLimited, status, type Context, type D1Statement } from './_shared';

/** Someone else's plan answers as if it did not exist. */
export async function onRequestGet({ request, env, params }: Context<'id'>) {
  if (!await roleOf(env.LIBRARY, params.id, caller(request))) return status(404, 'No such plan');
  const row = await env.LIBRARY.prepare('SELECT body, revision FROM projects WHERE id = ?').bind(params.id)
    .first<{ body: string; revision: number }>();
  if (!row) return status(404, 'No such plan');
  return new Response(row.body, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ETag: etag(row.revision) } });
}

/**
 * `If-None-Match: *` creates, and makes the signed-in person its owner; `If-Match: "<revision>"` replaces
 * only that revision, so a stale save gets 412. Only the owner and the people it is shared with may save.
 */
export async function onRequestPut({ request, env, params }: Context<'id'>) {
  const body = await readLimited(request, MAX_PLAN_BYTES);
  if (body === null) return status(413, `A plan over ${MAX_PLAN_BYTES} bytes stays in the browser`);
  let plan: { id?: unknown; name?: unknown; updatedAt?: unknown } | null = null;
  try { plan = JSON.parse(body); } catch {}
  if (!plan || plan.id !== params.id || typeof plan.name !== 'string' || typeof plan.updatedAt !== 'string') {
    return status(400, 'The body must be the plan whose id is in the address');
  }
  const email = caller(request);
  if (!await roleOf(env.LIBRARY, params.id, email)) return status(403, 'This plan is not shared with you');
  const name = plan.name.slice(0, 500), updatedAt = plan.updatedAt;
  const expected = matchedRevision(request);
  const statements: D1Statement[] = [];
  let revision: number;
  if (request.headers.get('If-None-Match') === '*') {
    statements.push(env.LIBRARY
      .prepare('INSERT INTO projects (id, name, updated_at, revision, body) VALUES (?, ?, ?, 1, ?) ON CONFLICT (id) DO NOTHING')
      .bind(params.id, name, updatedAt, body));
    // Only when this request's insert is the row now there: a create that lost to an existing plan claims nothing.
    if (email) statements.push(env.LIBRARY.prepare(`INSERT OR IGNORE INTO access (project_id, email, role) SELECT ?, ?, 'owner'
      WHERE NOT EXISTS (SELECT 1 FROM access WHERE project_id = ?) AND EXISTS (SELECT 1 FROM projects WHERE id = ? AND revision = 1 AND body = ?)`)
      .bind(params.id, email, params.id, params.id, body));
    revision = 1;
  } else if (expected !== null) {
    if (!Number.isSafeInteger(expected)) return status(412, 'The plan changed on another device');
    statements.push(env.LIBRARY
      .prepare('UPDATE projects SET name = ?, updated_at = ?, body = ?, revision = revision + 1 WHERE id = ? AND revision = ?')
      .bind(name, updatedAt, body, params.id, expected));
    revision = expected + 1;
  } else {
    return status(428, 'Send If-Match with the revision you opened, or If-None-Match: * to create');
  }
  const [{ meta: { changes } }] = await env.LIBRARY.batch([...statements, ...await versionStatements(env.LIBRARY, params.id, revision, body)]);
  return changes ? status(204, undefined, { ETag: etag(revision) }) : status(412, 'The plan changed on another device');
}

/** The owner deletes the plan; someone it is shared with only takes it off their own list. */
export async function onRequestDelete({ request, env, params }: Context<'id'>) {
  const expected = matchedRevision(request);
  if (expected === null) return status(428, 'Send If-Match with the revision you are deleting');
  const email = caller(request);
  const role = await roleOf(env.LIBRARY, params.id, email);
  if (!role) return status(204);
  if (role === 'editor') {
    await env.LIBRARY.prepare(`DELETE FROM access WHERE project_id = ? AND email = ? AND role = 'editor'`).bind(params.id, email).run();
    return status(204);
  }
  const row = await env.LIBRARY.prepare('SELECT revision FROM projects WHERE id = ?').bind(params.id).first<{ revision: number }>();
  if (!row) return status(204);
  const [, { meta }] = await env.LIBRARY.batch([
    deleteStatement(env.LIBRARY, params.id, expected),
    env.LIBRARY.prepare('DELETE FROM projects WHERE id = ? AND revision = ?').bind(params.id, expected),
  ]);
  return meta.changes ? status(204) : status(412, 'The plan changed on another device');
}

