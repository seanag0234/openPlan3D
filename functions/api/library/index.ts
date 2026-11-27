import { startPlanFor } from '../start-plan';
import { versionStatements } from './_history';
import { caller, claimStatement, visibleTo } from './_people';
import { MAX_PLAN_BYTES, type Context } from './_shared';

/** Each person's own copy of the starting plan joins their library the first time they list it; deleted later, it stays deleted. */
async function seedStartPlan({ request, env }: Context, email: string | null) {
  const plan = env.ASSETS ? await startPlanFor(env.ASSETS, request) : null;
  if (!plan || new TextEncoder().encode(plan.body).byteLength > MAX_PLAN_BYTES) return;
  if (await env.LIBRARY.prepare('SELECT 1 FROM versions WHERE project_id = ? LIMIT 1').bind(plan.id).first()) return;
  const { name, updatedAt } = JSON.parse(plan.body) as { name: string; updatedAt: string };
  await env.LIBRARY.batch([
    env.LIBRARY.prepare('INSERT INTO projects (id, name, updated_at, revision, body) VALUES (?, ?, ?, 1, ?) ON CONFLICT (id) DO NOTHING')
      .bind(plan.id, name.slice(0, 500), updatedAt, plan.body),
    ...(email ? [claimStatement(env.LIBRARY, plan.id, email)] : []),
    ...await versionStatements(env.LIBRARY, plan.id, 1, plan.body),
  ]);
}

/**
 * The plans the signed-in person may open. `sharedBy` names the owner of a plan someone shared with
 * them; `everyone` marks a plan nobody owns, which every signed-in person sees.
 */
export async function onRequestGet(context: Context) {
  const email = caller(context.request);
  await seedStartPlan(context, email);
  const { results } = await context.env.LIBRARY
    .prepare(`SELECT id, name, updated_at AS updatedAt, revision, thumbnail,
        (SELECT a.email FROM access a WHERE a.project_id = p.id AND a.role = 'owner') AS owner
      FROM projects p WHERE ${visibleTo('p.id')} ORDER BY updated_at DESC`)
    .bind(email)
    .all<{ owner: string | null }>();
  return Response.json(results.map(({ owner, ...plan }) => ({ ...plan, sharedBy: owner !== email ? owner : null, everyone: owner === null })),
    { headers: { 'Cache-Control': 'no-store' } });
}

