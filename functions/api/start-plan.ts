// The Pages build's /api/start-plan, answering as src/routes/api/start-plan/+server.ts does on the Node
// server. The plan is build/start-plan.json, copied in at deploy time; the Access gate covers it like
// every other file on the site.
import { tokenEmail } from './library/_access';
import { sha256 } from './library/_history';
import type { Assets } from './library/_shared';

const headers = { 'Cache-Control': 'no-store' };

/**
 * The starting plan as the signed-in person's own copy: an id and a name of their own, so each person
 * gets one, and dates when the file has none. Null when the build has no plan.
 */
export async function startPlanFor(assets: Assets, request: Request): Promise<{ id: string; body: string } | null> {
  const file = await assets.fetch(new URL('/start-plan.json', request.url));
  // Pages answers a missing file with the app's index.html, so only JSON counts.
  if (!file.ok || !(file.headers.get('Content-Type') ?? '').includes('json')) return null;
  let plan: { id?: unknown; name?: unknown; createdAt?: unknown; updatedAt?: unknown };
  try { plan = JSON.parse(await file.text()); } catch { return null; }
  if (typeof plan?.id !== 'string' || typeof plan.name !== 'string') return null;
  const email = tokenEmail(request.headers.get('Cf-Access-Jwt-Assertion'));
  if (email) {
    plan.id = `${plan.id}-${(await sha256(email)).slice(0, 12)}`;
    plan.name = `${plan.name} (${email.split('@')[0]})`;
  }
  // The editor fills missing dates in on opening, and compares plans without them.
  if (typeof plan.updatedAt !== 'string') plan.updatedAt = new Date().toISOString();
  if (typeof plan.createdAt !== 'string') plan.createdAt = plan.updatedAt;
  return { id: plan.id as string, body: JSON.stringify(plan) };
}

export async function onRequestGet({ request, env }: { request: Request; env: { ASSETS: Assets } }) {
  const plan = await startPlanFor(env.ASSETS, request);
  if (new URL(request.url).searchParams.has('info')) return Response.json({ available: plan !== null }, { headers });
  if (plan === null) return new Response(null, { status: 204, headers });
  return new Response(plan.body, { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } });
}

