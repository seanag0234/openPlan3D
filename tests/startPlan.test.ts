import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// vitest.config.ts does not load the SvelteKit plugin: the route's private environment is this object.
const { env } = vi.hoisted(() => ({ env: {} as Record<string, string | undefined> }));
vi.mock('$env/dynamic/private', () => ({ env }));

import { GET } from '../src/routes/api/start-plan/+server';

let dir = '';
const plan = JSON.stringify({ id: 'made-up-plan', name: 'A made-up plan' });

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'start-plan-'));
  await writeFile(join(dir, 'plan.json'), plan);
  await mkdir(join(dir, 'folder'));
});
afterAll(() => rm(dir, { recursive: true, force: true }));
beforeEach(() => { for (const key of Object.keys(env)) delete env[key]; });

const ask = (query = '') => GET({ url: new URL(`http://copy.test/api/start-plan${query}`) } as never);

async function expectNothing(query = '') {
  const response = await ask(query);
  expect(response.status).toBe(204);
  expect(await response.text()).toBe('');
  expect(response.headers.get('cache-control')).toBe('no-store');
}

it('answers 204 with nothing when no starting plan is set', async () => {
  await expectNothing();
});

it('answers 204 for a relative path, a missing file and a folder', async () => {
  env.START_PLAN_FILE = 'plan.json';
  await expectNothing();
  env.START_PLAN_FILE = join(dir, 'missing.json');
  await expectNothing();
  env.START_PLAN_FILE = join(dir, 'folder');
  await expectNothing();
});

it('answers 204 for a file over 20 MB', async () => {
  const big = join(dir, 'big.json');
  await writeFile(big, Buffer.alloc(20 * 1024 * 1024 + 1, 32));
  env.START_PLAN_FILE = big;
  await expectNothing();
});

it('says whether a starting plan is available', async () => {
  let response = await ask('?info=1');
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ available: false });
  expect(response.headers.get('cache-control')).toBe('no-store');

  env.START_PLAN_FILE = join(dir, 'missing.json');
  response = await ask('?info=1');
  expect(await response.json()).toEqual({ available: false });

  env.START_PLAN_FILE = join(dir, 'plan.json');
  response = await ask('?info=1');
  expect(response.status).toBe(200);
  const text = await response.text();
  expect(JSON.parse(text)).toEqual({ available: true });
  expect(text).not.toContain(dir);
  expect(response.headers.get('cache-control')).toBe('no-store');
});

it('serves the file as JSON, without its path', async () => {
  env.START_PLAN_FILE = join(dir, 'plan.json');
  const response = await ask();
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toBe('application/json');
  expect(response.headers.get('cache-control')).toBe('no-store');
  const text = await response.text();
  expect(text).toBe(plan);
  expect([...response.headers.values()].join(' ')).not.toContain(dir);
});
