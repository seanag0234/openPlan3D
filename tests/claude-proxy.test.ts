import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const env: Record<string, string | undefined> = {};
vi.mock('$env/dynamic/private', () => ({ env }));
const { forwardToClaude, serverClaudeKey } = await import('$lib/server/claudeProxy');

const keyFile = (text: string) => {
  const path = join(mkdtempSync(join(tmpdir(), 'claude-key-')), 'key');
  writeFileSync(path, text);
  return path;
};
const ask = (body: unknown, headers: Record<string, string> = {}) => new Request('https://plan.example/api/claude/v1/messages', {
  method: 'POST', body: JSON.stringify(body),
  headers: { host: 'plan.example', 'content-type': 'application/json', 'anthropic-version': '2023-06-01', ...headers },
});
const good = { model: 'claude-opus-5-5', max_tokens: 16000, messages: [{ role: 'user', content: 'hi' }] };

afterEach(() => { vi.unstubAllGlobals(); delete env.CLAUDE_KEY_FILE; });

describe("the server's Claude key", () => {
  it('is read from CLAUDE_KEY_FILE, and only an Anthropic key counts', async () => {
    expect(await serverClaudeKey()).toBeNull();
    env.CLAUDE_KEY_FILE = keyFile('sk-ant-test\n');
    expect(await serverClaudeKey()).toBe('sk-ant-test');
    env.CLAUDE_KEY_FILE = keyFile('sk-or-test');
    expect(await serverClaudeKey()).toBeNull();
  });

  it('goes to Anthropic in place of the browser, with the body and betas unchanged', async () => {
    env.CLAUDE_KEY_FILE = keyFile('sk-ant-test');
    const fetch = vi.fn(async () => new Response('{"type":"message"}', { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetch);
    const res = await forwardToClaude(ask(good, { 'anthropic-beta': 'server-side-fallback-2026-07-01', origin: 'https://plan.example', 'sec-fetch-site': 'same-origin' }));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('{"type":"message"}');
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.headers).toMatchObject({ 'x-api-key': 'sk-ant-test', 'anthropic-beta': 'server-side-fallback-2026-07-01' });
    expect(JSON.parse(init.body as string)).toEqual(good);
  });

  it('refuses without a key, from another site, for another model or a bigger answer, sending nothing', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect((await forwardToClaude(ask(good))).status).toBe(503);
    env.CLAUDE_KEY_FILE = keyFile('sk-ant-test');
    expect((await forwardToClaude(ask(good, { origin: 'https://evil.example' }))).status).toBe(403);
    expect((await forwardToClaude(ask(good, { 'sec-fetch-site': 'cross-site' }))).status).toBe(403);
    expect((await forwardToClaude(ask(good, { 'content-type': 'text/plain' }))).status).toBe(415);
    expect((await forwardToClaude(ask({ ...good, model: 'claude-fable-5-2' }))).status).toBe(400);
    expect((await forwardToClaude(ask({ ...good, max_tokens: 64000 }))).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
});
