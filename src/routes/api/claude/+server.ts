import { serverClaudeKey } from '$lib/server/claudeProxy';

/** Whether this server holds a Claude key, so the editor can ask without one of its own. Never the key itself. */
export async function GET() {
  return new Response(JSON.stringify({ available: !!(await serverClaudeKey()) }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
