// The Pages build's /api/start-plan, answering as src/routes/api/start-plan/+server.ts does on the Node
// server. The plan is build/start-plan.json, copied in at deploy time; the Access gate covers it like
// every other file on the site.
import type { Assets } from './library/_shared';

const headers = { 'Cache-Control': 'no-store' };

/** The starting plan's text, or null when the build has none. */
export async function readStartPlan(assets: Assets, at: string): Promise<string | null> {
  const file = await assets.fetch(new URL('/start-plan.json', at));
  // Pages answers a missing file with the app's index.html, so only JSON counts.
  return file.ok && (file.headers.get('Content-Type') ?? '').includes('json') ? file.text() : null;
}

export async function onRequestGet({ request, env }: { request: Request; env: { ASSETS: Assets } }) {
  const plan = await readStartPlan(env.ASSETS, request.url);
  if (new URL(request.url).searchParams.has('info')) return Response.json({ available: plan !== null }, { headers });
  if (plan === null) return new Response(null, { status: 204, headers });
  return new Response(plan, { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } });
}

