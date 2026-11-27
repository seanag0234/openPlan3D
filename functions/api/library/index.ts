import { readStartPlan } from '../start-plan';
import { versionStatements } from './_history';
import { MAX_PLAN_BYTES, type Context } from './_shared';

/** The starting plan joins the library the first time it is listed; deleted later, it stays deleted. */
async function seedStartPlan({ request, env }: Context) {
  const file = env.ASSETS ? await readStartPlan(env.ASSETS, request.url) : null;
  let plan: { id?: unknown; name?: unknown; createdAt?: unknown; updatedAt?: unknown } | null = null;
  try { plan = file && new TextEncoder().encode(file).byteLength <= MAX_PLAN_BYTES ? JSON.parse(file) : null; } catch {}
  if (!plan || typeof plan.id !== 'string' || typeof plan.name !== 'string') return;
  if (await env.LIBRARY.prepare('SELECT 1 FROM versions WHERE project_id = ? LIMIT 1').bind(plan.id).first()) return;
  // A plan file may carry no dates; the editor fills them in on opening, and compares plans without them.
  if (typeof plan.updatedAt !== 'string') plan.updatedAt = new Date().toISOString();
  if (typeof plan.createdAt !== 'string') plan.createdAt = plan.updatedAt;
  const body = JSON.stringify(plan);
  await env.LIBRARY.batch([
    env.LIBRARY.prepare('INSERT INTO projects (id, name, updated_at, revision, body) VALUES (?, ?, ?, 1, ?) ON CONFLICT (id) DO NOTHING')
      .bind(plan.id, plan.name.slice(0, 500), plan.updatedAt, body),
    ...await versionStatements(env.LIBRARY, plan.id, 1, body),
  ]);
}

export async function onRequestGet(context: Context) {
  await seedStartPlan(context);
  const { results } = await context.env.LIBRARY
    .prepare('SELECT id, name, updated_at AS updatedAt, revision, thumbnail FROM projects ORDER BY updated_at DESC')
    .all();
  return Response.json(results, { headers: { 'Cache-Control': 'no-store' } });
}

