import { env } from '$env/dynamic/private';
import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';

/** The only models the server's key pays for, and the most a single answer may cost. */
const MODELS = new Set(['claude-opus-5-5', 'claude-sonnet-5-5']);
const MAX_TOKENS = 16_000;
const MAX_BODY = 4 * 1024 * 1024;
const UPSTREAM = 'https://api.anthropic.com/v1/messages';

/** The Anthropic key in the file CLAUDE_KEY_FILE names, read per request so a new key needs no restart. */
export async function serverClaudeKey(): Promise<string | null> {
  const path = env.CLAUDE_KEY_FILE;
  if (!path || !isAbsolute(path)) return null;
  try {
    const key = (await readFile(path, 'utf8')).trim();
    return key.startsWith('sk-ant-') ? key : null;
  } catch { return null; }
}

const refuse = (status: number, message: string) => new Response(
  JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message } }),
  { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } },
);

/**
 * Sends the editor's Messages request on to Anthropic with the server's key, which never reaches the browser.
 * Only this server's own pages may use it: another site open in her browser could otherwise spend the key.
 */
export async function forwardToClaude(request: Request): Promise<Response> {
  const key = await serverClaudeKey();
  if (!key) return refuse(503, 'This server has no Claude key.');

  const origin = request.headers.get('origin');
  const site = request.headers.get('sec-fetch-site');
  if ((origin && new URL(origin).host !== request.headers.get('host')) || (site && site !== 'same-origin')) {
    return refuse(403, 'Only this site can use its Claude key.');
  }
  if (!request.headers.get('content-type')?.startsWith('application/json')) return refuse(415, 'Send JSON.');

  const text = await request.text();
  if (text.length > MAX_BODY) return refuse(413, 'The request is too large.');
  let body: { model?: unknown; max_tokens?: unknown; stream?: unknown };
  try { body = JSON.parse(text); } catch { return refuse(400, 'The request is not JSON.'); }
  if (typeof body.model !== 'string' || !MODELS.has(body.model)) return refuse(400, 'That model is not offered here.');
  if (typeof body.max_tokens !== 'number' || body.max_tokens > MAX_TOKENS) return refuse(400, `max_tokens must be at most ${MAX_TOKENS}.`);

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-api-key': key,
    'anthropic-version': request.headers.get('anthropic-version') ?? '2023-06-01',
  };
  const beta = request.headers.get('anthropic-beta');
  if (beta) headers['anthropic-beta'] = beta;

  // The body goes on unchanged; the answer comes back unchanged, status and errors included.
  const upstream = await fetch(UPSTREAM, { method: 'POST', headers, body: text, signal: request.signal });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
      'Cache-Control': 'no-store',
      ...(upstream.headers.get('retry-after') ? { 'Retry-After': upstream.headers.get('retry-after')! } : {}),
    },
  });
}
