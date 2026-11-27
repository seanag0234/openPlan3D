import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { librarySite } from './fixtures/librarySite';
import { VERSIONS_PAGE } from '../functions/api/library/[id]/versions';

const ID = 'plan-1';
const picture = `data:image/png;base64,${'A'.repeat(20_000)}`;
const plan = (name: string, extra: object = {}) => JSON.stringify({ id: ID, name, updatedAt: '2026-11-27T10:00:00.000Z', customEntourage: [{ dataUrl: picture }], ...extra });

function site() {
  const s = librarySite();
  const call = (path: string, init?: RequestInit) => s.fetch(`/api/library${path}`, init);
  const put = (body: string, headers: Record<string, string>) => call(`/${ID}`, { method: 'PUT', body, headers });
  const count = (table: string) => (s.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
  return { ...s, call, put, count };
}

describe('online history', () => {
  it('logs every save, and stores a picture the saves share once', async () => {
    const s = site();
    expect((await s.put(plan('One'), { 'If-None-Match': '*' })).status).toBe(204);
    expect((await s.put(plan('Two'), { 'If-Match': '"1"' })).status).toBe(204);
    expect((await s.put(plan('Three'), { 'If-Match': '"2"' })).status).toBe(204);
    expect(s.count('versions')).toBe(3);
    expect(s.count('blobs')).toBe(1);
    const listed = await (await s.call(`/${ID}/versions`)).json();
    expect(listed.map((v: { name: string }) => v.name)).toEqual(['Three', 'Two', 'One']);
    const first = await s.call(`/${ID}/versions/${listed[2].seq}`);
    expect(JSON.parse(await first.text())).toEqual(JSON.parse(plan('One')));
  });

  it('logs nothing for a save the library refused', async () => {
    const s = site();
    await s.put(plan('One'), { 'If-None-Match': '*' });
    expect((await s.put(plan('Stale'), { 'If-Match': '"7"' })).status).toBe(412);
    expect(s.count('versions')).toBe(1);
  });

  it('keeps a deleted plan, and brings it back as its last save', async () => {
    const s = site();
    await s.put(plan('One'), { 'If-None-Match': '*' });
    await s.put(plan('Kept'), { 'If-Match': '"1"' });
    expect((await s.call(`/${ID}`, { method: 'DELETE', headers: { 'If-Match': '"2"' } })).status).toBe(204);
    const [gone] = await (await s.call('/deleted')).json();
    expect(gone).toMatchObject({ id: ID, name: 'Kept' });
    expect((await s.call(`/${ID}/versions/${gone.seq}`, { method: 'POST' })).status).toBe(204);
    const back = await s.call(`/${ID}`);
    expect(JSON.parse(await back.text())).toEqual(JSON.parse(plan('Kept')));
    expect(back.headers.get('ETag')).toBe('"4"');
    expect(await (await s.call('/deleted')).json()).toEqual([]);
    const log = await (await s.call(`/${ID}/versions`)).json();
    expect(log.map((v: { revision: number; deleted: boolean }) => [v.revision, v.deleted])).toEqual([[4, false], [3, true], [2, false], [1, false]]);
    expect((await s.put(plan('After'), { 'If-Match': '"4"' })).status).toBe(204);
  });

  it('refuses to bring back a plan that is in the library', async () => {
    const s = site();
    await s.put(plan('One'), { 'If-None-Match': '*' });
    const [only] = await (await s.call(`/${ID}/versions`)).json();
    expect((await s.call(`/${ID}/versions/${only.seq}`, { method: 'POST' })).status).toBe(409);
    expect(s.count('versions')).toBe(1);
  });

  it('pages through a long log', async () => {
    const s = site();
    await s.put(plan('Save 0'), { 'If-None-Match': '*' });
    for (let i = 1; i <= VERSIONS_PAGE; i++) await s.put(plan(`Save ${i}`), { 'If-Match': `"${i}"` });
    const page = await (await s.call(`/${ID}/versions`)).json();
    expect(page).toHaveLength(VERSIONS_PAGE);
    const rest = await (await s.call(`/${ID}/versions?before=${page.at(-1).seq}`)).json();
    expect(rest.map((v: { name: string }) => v.name)).toEqual(['Save 0']);
  });

  it('puts the starting plan in the library once, and leaves it deleted once deleted', async () => {
    const s = site();
    s.env.ASSETS = { fetch: async (url: URL) => url.pathname === '/start-plan.json'
      ? new Response(JSON.stringify({ id: ID, name: 'Little Georgetown', floors: [] }), { headers: { 'Content-Type': 'application/json' } })
      : new Response('<!doctype html>', { headers: { 'Content-Type': 'text/html' } }) };
    expect((await (await s.call('')).json()).map((p: { name: string }) => p.name)).toEqual(['Little Georgetown']);
    expect((await (await s.call('')).json())).toHaveLength(1);
    expect(s.count('versions')).toBe(1);
    expect((await s.call(`/${ID}`, { method: 'DELETE', headers: { 'If-Match': '"1"' } })).status).toBe(204);
    expect(await (await s.call('')).json()).toEqual([]);
  });

  it('gives each signed-in person their own starting plan, and everyone sees them all', async () => {
    const s = site();
    s.env.ASSETS = { fetch: async () => new Response(JSON.stringify({ id: 'town', name: 'Little Georgetown' }), { headers: { 'Content-Type': 'application/json' } }) };
    const as = (email: string) => ({ headers: { 'Cf-Access-Jwt-Assertion': `x.${Buffer.from(JSON.stringify({ email })).toString('base64url')}.y` } });
    await s.call('', as('sean@example.com'));
    await s.call('', as('sean@example.com'));
    const names = (await (await s.call('', as('aubrey@example.com'))).json()).map((p: { name: string }) => p.name).sort();
    expect(names).toEqual(['Little Georgetown (aubrey)', 'Little Georgetown (sean)']);
  });

  it('starts the log of a plan saved before it existed, once', () => {
    const s = site();
    s.db.prepare("INSERT INTO projects (id, name, updated_at, revision, body) VALUES (?, 'Old', '2026-11-01T00:00:00Z', 5, ?)").run(ID, plan('Old'));
    const schema = readFileSync(new URL('../functions/api/library/schema.sql', import.meta.url), 'utf8');
    s.db.exec(schema);
    s.db.exec(schema);
    expect(s.db.prepare('SELECT revision, name FROM versions').all()).toEqual([{ revision: 5, name: 'Old' }]);
  });
});

