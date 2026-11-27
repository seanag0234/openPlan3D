import { caller, claimStatement, roleOf } from '../_people';
import { status, type Context } from '../_shared';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Who owns the plan and who it is shared with; `you` is the signed-in person. */
export async function onRequestGet({ request, env, params }: Context<'id'>) {
  const you = caller(request);
  if (!await roleOf(env.LIBRARY, params.id, you)) return status(404, 'No such plan');
  const { results } = await env.LIBRARY.prepare('SELECT email, role FROM access WHERE project_id = ? ORDER BY email')
    .bind(params.id).all<{ email: string; role: string }>();
  return Response.json({
    you,
    owner: results.find(row => row.role === 'owner')?.email ?? null,
    people: results.filter(row => row.role === 'editor').map(row => row.email),
  }, { headers: { 'Cache-Control': 'no-store' } });
}

/**
 * `{ email }` shares the plan with that person, who can then open and save it. Only the owner shares; on
 * a plan everyone can open, the first person to share it (or to send `{}`) becomes its owner.
 */
export async function onRequestPost({ request, env, params }: Context<'id'>) {
  const you = caller(request);
  if (!you) return status(403, 'Sign in to share a plan');
  let email: unknown;
  try { ({ email } = await request.json() as { email?: unknown }); } catch { return status(400, 'The body must be JSON'); }
  if (email !== undefined && (typeof email !== 'string' || !EMAIL.test(email.trim()))) return status(400, 'Give the email address they sign in with');
  const role = await roleOf(env.LIBRARY, params.id, you);
  if (!role) return status(404, 'No such plan');
  if (role === 'editor') return status(403, 'Only the owner can share this plan');
  if (!await env.LIBRARY.prepare('SELECT 1 FROM projects WHERE id = ?').bind(params.id).first()) return status(404, 'No such plan');
  const other = typeof email === 'string' ? email.trim().toLowerCase() : null;
  await env.LIBRARY.batch([
    claimStatement(env.LIBRARY, params.id, you),
    ...(other && other !== you ? [env.LIBRARY.prepare(`INSERT OR IGNORE INTO access (project_id, email, role) SELECT ?, ?, 'editor'
      WHERE EXISTS (SELECT 1 FROM access WHERE project_id = ? AND email = ? AND role = 'owner')`).bind(params.id, other, params.id, you)] : []),
  ]);
  return status(204);
}

/** `?email=` stops sharing with that person. Only the owner does this; the person can also leave the plan by deleting it. */
export async function onRequestDelete({ request, env, params }: Context<'id'>) {
  const you = caller(request);
  const email = new URL(request.url).searchParams.get('email')?.toLowerCase();
  if (!email) return status(400, 'Say who to stop sharing with');
  if (await roleOf(env.LIBRARY, params.id, you) !== 'owner') return status(403, 'Only the owner can stop sharing this plan');
  await env.LIBRARY.prepare(`DELETE FROM access WHERE project_id = ? AND email = ? AND role = 'editor'`).bind(params.id, email).run();
  return status(204);
}

