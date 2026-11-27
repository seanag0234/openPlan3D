// The Pages build's /api/start-plan, answering as src/routes/api/start-plan/+server.ts does on the Node
// server. The plan is build/start-plan.json, copied in at deploy time; the Access gate covers it like
// every other file on the site.
export interface StartPlanEnv { ASSETS: { fetch(input: URL): Promise<Response> } }

const headers = { 'Cache-Control': 'no-store' };

export async function onRequestGet({ request, env }: { request: Request; env: StartPlanEnv }) {
  const url = new URL(request.url);
  const file = await env.ASSETS.fetch(new URL('/start-plan.json', url));
  // Pages answers a missing file with the app's index.html, so only JSON counts.
  const available = file.ok && (file.headers.get('Content-Type') ?? '').includes('json');
  if (url.searchParams.has('info')) return Response.json({ available }, { headers });
  if (!available) return new Response(null, { status: 204, headers });
  return new Response(file.body, { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } });
}

