import { startPlanFor } from '../start-plan';
import { versionStatements } from './_history';
import { MAX_PLAN_BYTES, type Context } from './_shared';

/** Each person's own copy of the starting plan joins the library the first time they list it; deleted later, it stays deleted. */
async function seedStartPlan({ request, env }: Context) {
  const plan = env.ASSETS ? await startPlanFor(env.ASSETS, request) : null;
  if (!plan || new TextEncoder().encode(plan.body).byteLength > MAX_PLAN_BYTES) return;
  if (await env.LIBRARY.prepare('SELECT 1 FROM versions WHERE project_id = ? LIMIT 1').bind(plan.id).first()) return;
  const { name, updatedAt } = JSON.parse(plan.body) as { name: string; updatedAt: string };
  await env.LIBRARY.batch([
    env.LIBRARY.prepare('INSERT INTO projects (id, name, updated_at, revision, body) VALUES (?, ?, ?, 1, ?) ON CONFLICT (id) DO NOTHING')
      .bind(plan.id, name.slice(0, 500), updatedAt, plan.body),
    ...await versionStatements(env.LIBRARY, plan.id, 1, plan.body),
  ]);
}

export async function onRequestGet(context: Context) {
  await seedStartPlan(context);
  const { results } = await context.env.LIBRARY
    .prepare('SELECT id, name, updated_at AS updatedAt, revision, thumbnail FROM projects ORDER BY updated_at DESC')
    .all();
  return Response.json(results, { headers: { 'Cache-Control': 'no-store' } });
}

