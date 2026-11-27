import { describe, expect, it } from 'vitest';
import { onRequestGet } from '../functions/api/start-plan';

const plan = '{"name":"Starting plan"}';
const site = (file: Response) => ({ ASSETS: { fetch: async (url: URL) => (url.pathname === '/start-plan.json' ? file : new Response(null, { status: 404 })) } });
const json = () => new Response(plan, { headers: { 'Content-Type': 'application/json' } });
const fallback = () => new Response('<!doctype html>', { headers: { 'Content-Type': 'text/html' } });
const get = (query: string, file: Response) => onRequestGet({ request: new Request(`https://site.test/api/start-plan${query}`), env: site(file) });

describe('Pages starting plan', () => {
  it('serves the plan copied into the build', async () => {
    const response = await get('', json());
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(plan);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('answers 204 when the build has no plan and Pages falls back to the app page', async () => {
    expect((await get('', fallback())).status).toBe(204);
  });

  it('says whether a plan is available', async () => {
    expect(await (await get('?info=1', json())).json()).toEqual({ available: true });
    expect(await (await get('?info=1', fallback())).json()).toEqual({ available: false });
  });
});

