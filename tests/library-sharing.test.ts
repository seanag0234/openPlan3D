import { describe, expect, it } from 'vitest';
import { librarySite } from './fixtures/librarySite';

const ID = 'plan-1';
const plan = (name: string) => JSON.stringify({ id: ID, name, updatedAt: '2026-11-27T10:00:00.000Z' });
const token = (email: string) => `x.${Buffer.from(JSON.stringify({ email })).toString('base64url')}.y`;

function site() {
  const s = librarySite();
  const as = (email: string) => (path: string, init: RequestInit = {}) =>
    s.fetch(`/api/library${path}`, { ...init, headers: { ...init.headers as Record<string, string>, 'Cf-Access-Jwt-Assertion': token(email) } });
  return { ...s, sean: as('sean@example.com'), aubrey: as('aubrey@example.com'), kid: as('kid@example.com') };
}
const names = async (response: Response) => (await response.json()).map((p: { name: string }) => p.name);
const share = (email?: string) => ({ method: 'POST', body: JSON.stringify(email ? { email } : {}) });

describe('private plans', () => {
  it('shows a new plan only to the person who saved it', async () => {
    const s = site();
    expect((await s.sean(`/${ID}`, { method: 'PUT', body: plan('Mine'), headers: { 'If-None-Match': '*' } })).status).toBe(204);
    expect(await names(await s.sean(''))).toEqual(['Mine']);
    expect(await names(await s.aubrey(''))).toEqual([]);
    expect((await s.aubrey(`/${ID}`)).status).toBe(404);
    expect((await s.aubrey(`/${ID}/versions`)).status).toBe(404);
    expect((await s.aubrey(`/${ID}`, { method: 'PUT', body: plan('Theirs'), headers: { 'If-Match': '"1"' } })).status).toBe(403);
    expect((await s.aubrey(`/${ID}`, { method: 'PUT', body: plan('Theirs'), headers: { 'If-None-Match': '*' } })).status).toBe(403);
  });

  it('lets the owner share it, and the person it is shared with open, save and leave it', async () => {
    const s = site();
    await s.sean(`/${ID}`, { method: 'PUT', body: plan('Mine'), headers: { 'If-None-Match': '*' } });
    expect((await s.aubrey(`/${ID}/people`, share('kid@example.com'))).status).toBe(404);
    expect((await s.sean(`/${ID}/people`, share(' Aubrey@Example.com '))).status).toBe(204);
    const [listed] = await (await s.aubrey('')).json();
    expect(listed).toMatchObject({ name: 'Mine', sharedBy: 'sean@example.com', everyone: false });
    expect((await (await s.sean('')).json())[0]).toMatchObject({ sharedBy: null, everyone: false });
    expect((await s.aubrey(`/${ID}`, { method: 'PUT', body: plan('Ours'), headers: { 'If-Match': '"1"' } })).status).toBe(204);
    expect(await (await s.aubrey(`/${ID}/people`)).json()).toEqual({ you: 'aubrey@example.com', owner: 'sean@example.com', people: ['aubrey@example.com'] });
    expect((await s.aubrey(`/${ID}/people`, share('kid@example.com'))).status).toBe(403);
    expect((await s.aubrey(`/${ID}`, { method: 'DELETE', headers: { 'If-Match': '"2"' } })).status).toBe(204);
    expect(await names(await s.aubrey(''))).toEqual([]);
    expect(await names(await s.sean(''))).toEqual(['Ours']);
  });

  it('lets the owner stop sharing', async () => {
    const s = site();
    await s.sean(`/${ID}`, { method: 'PUT', body: plan('Mine'), headers: { 'If-None-Match': '*' } });
    await s.sean(`/${ID}/people`, share('aubrey@example.com'));
    expect((await s.aubrey(`/${ID}/people?email=aubrey@example.com`, { method: 'DELETE' })).status).toBe(403);
    expect((await s.sean(`/${ID}/people?email=aubrey@example.com`, { method: 'DELETE' })).status).toBe(204);
    expect((await s.aubrey(`/${ID}`)).status).toBe(404);
  });

  it('keeps a deleted plan and its bringing back to its owner', async () => {
    const s = site();
    await s.sean(`/${ID}`, { method: 'PUT', body: plan('Mine'), headers: { 'If-None-Match': '*' } });
    await s.sean(`/${ID}/people`, share('aubrey@example.com'));
    await s.sean(`/${ID}`, { method: 'DELETE', headers: { 'If-Match': '"1"' } });
    expect(await (await s.aubrey('/deleted')).json()).toEqual([]);
    const [gone] = await (await s.sean('/deleted')).json();
    expect((await s.aubrey(`/${ID}/versions/${gone.seq}`, { method: 'POST' })).status).toBe(403);
    expect((await s.kid(`/${ID}/versions/${gone.seq}`, { method: 'POST' })).status).toBe(404);
    expect((await s.sean(`/${ID}/versions/${gone.seq}`, { method: 'POST' })).status).toBe(204);
    expect(await names(await s.aubrey(''))).toEqual(['Mine']);
  });

  it('shows a plan saved before plans were private to everyone, until someone makes it theirs', async () => {
    const s = site();
    s.db.prepare("INSERT INTO projects (id, name, updated_at, revision, body) VALUES (?, 'Old', '2026-11-01T00:00:00Z', 1, ?)").run(ID, plan('Old'));
    expect((await (await s.aubrey('')).json())[0]).toMatchObject({ name: 'Old', sharedBy: null, everyone: true });
    // A create that loses to the existing plan claims nothing.
    expect((await s.kid(`/${ID}`, { method: 'PUT', body: plan('Kid'), headers: { 'If-None-Match': '*' } })).status).toBe(412);
    expect((await s.sean(`/${ID}/people`, share())).status).toBe(204);
    expect(await names(await s.aubrey(''))).toEqual([]);
    expect(await names(await s.sean(''))).toEqual(['Old']);
  });
});

