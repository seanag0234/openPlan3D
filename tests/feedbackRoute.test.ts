import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// vitest.config.ts does not load the SvelteKit plugin: the route's private environment is this object.
const { env } = vi.hoisted(() => ({ env: {} as Record<string, string | undefined> }));
vi.mock('$env/dynamic/private', () => ({ env }));

import { GET, POST } from '../src/routes/api/feedback/+server';
import * as files from '$lib/server/feedbackFiles';

let dir = '';
beforeEach(async () => {
  for (const key of Object.keys(env)) delete env[key];
  dir = await mkdtemp(join(tmpdir(), 'feedback-route-'));
});
afterEach(() => rm(dir, { recursive: true, force: true }));

const message = (overrides: Record<string, unknown> = {}) => ({
  id: 'abcdef12-0000-4000-8000-000000000000', createdAt: new Date().toISOString(),
  text: 'A made-up wish.', about: null, planName: null, context: { view: '2d' }, picture: null, ...overrides,
});
const url = new URL('http://copy.test/api/feedback');
function post(body: unknown, headers: Record<string, string> = {}) {
  const request = new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  return POST({ request, url } as never);
}
const get = () => GET();

it('says feedback is off unless FEEDBACK_DIR is an absolute path', async () => {
  for (const value of [undefined, '', 'feedback', './feedback']) {
    env.FEEDBACK_DIR = value;
    const response = await get();
    expect(await response.json()).toEqual({ enabled: false });
    expect(response.headers.get('cache-control')).toBe('no-store');
  }
  env.FEEDBACK_DIR = dir;
  expect(await (await get()).json()).toEqual({ enabled: true });
});

it('answers 503 when feedback is off, and writes nothing', async () => {
  const response = await post(message());
  expect(response.status).toBe(503);
  expect(response.headers.get('cache-control')).toBe('no-store');
  env.FEEDBACK_DIR = 'relative';
  expect((await post(message())).status).toBe(503);
});

it('answers 403 to a page from another host', async () => {
  env.FEEDBACK_DIR = dir;
  for (const origin of ['http://evil.test', 'http://copy.test.evil.test', 'null']) {
    const response = await post(message(), { Origin: origin });
    expect(response.status).toBe(403);
    expect(response.headers.get('cache-control')).toBe('no-store');
  }
  expect(await readdir(dir)).toEqual([]);
});

it('writes a message: 201, then 200 for the same message again', async () => {
  env.FEEDBACK_DIR = dir;
  let response = await post(message(), { Origin: 'http://copy.test' });
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({ ok: true });
  expect(response.headers.get('cache-control')).toBe('no-store');
  response = await post(message());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
  expect((await readdir(dir)).filter(name => name.endsWith('.md'))).toHaveLength(1);
});

it('a refused message answers its status and reason', async () => {
  env.FEEDBACK_DIR = dir;
  const response = await post(message({ text: '' }));
  expect(response.status).toBe(400);
  expect((await response.json()).error).toMatch(/words/);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect((await post('{not json')).status).toBe(400);
});

it('anything else answers 500 with a fixed message, and logs neither the words nor the picture', async () => {
  env.FEEDBACK_DIR = dir;
  vi.spyOn(files, 'writeFeedback').mockRejectedValue(new Error('disk on fire: A secret made-up wish.'));
  const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
  const response = await post(message({ text: 'A secret made-up wish.', picture: 'data:image/jpeg;base64,/9j/4AAQ' }));
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: 'Feedback could not be kept. It will be sent again later.' });
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(JSON.stringify(logged.mock.calls)).not.toMatch(/secret made-up wish|9j\/4AAQ/);
});
