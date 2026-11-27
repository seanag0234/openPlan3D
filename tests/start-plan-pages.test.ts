import { describe, expect, it } from 'vitest';
import { onRequestGet } from '../functions/api/start-plan';

const plan = '{"id":"town","name":"Starting plan"}';
const site = (file: Response) => ({ ASSETS: { fetch: async (url: URL) => (url.pathname === '/start-plan.json' ? file : new Response(null, { status: 404 })) } });
const json = () => new Response(plan, { headers: { 'Content-Type': 'application/json' } });
const fallback = () => new Response('<!doctype html>', { headers: { 'Content-Type': 'text/html' } });
const token = (email: string) => `x.${Buffer.from(JSON.stringify({ email })).toString('base64url')}.y`;
const get = (query: string, file: Response, email?: string) => onRequestGet({
  request: new Request(`https://site.test/api/start-plan${query}`, { headers: email ? { 'Cf-Access-Jwt-Assertion': token(email) } : {} }),
  env: site(file),
});

describe('Pages starting plan', () => {
  it('serves the plan copied into the build, with the dates it lacks', async () => {
    const response = await get('', json());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: 'town', name: 'Starting plan', updatedAt: expect.any(String), createdAt: expect.any(String) });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('gives each signed-in person a copy of their own', async () => {
    const sean = await (await get('', json(), 'Sean@Example.com')).json();
    const again = await (await get('', json(), 'sean@example.com')).json();
    const aubrey = await (await get('', json(), 'aubrey@example.com')).json();
    expect(sean.name).toBe('Starting plan');
    expect(again.id).toBe(sean.id);
    expect(aubrey.id).not.toBe(sean.id);
    expect(sean.id).toMatch(/^town-[0-9a-f]{12}$/);
  });

  it('answers 204 when the build has no plan and Pages falls back to the app page', async () => {
    expect((await get('', fallback())).status).toBe(204);
  });

  it('says whether a plan is available', async () => {
    expect(await (await get('?info=1', json())).json()).toEqual({ available: true });
    expect(await (await get('?info=1', fallback())).json()).toEqual({ available: false });
  });
});

