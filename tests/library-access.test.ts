import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { accessRefusal } from '../functions/api/library/_access';
import { onRequest } from '../functions/api/library/_middleware';
import type { Env } from '../functions/api/library/_shared';

const TEAM = 'https://family.cloudflareaccess.com', AUD = 'app-audience-tag';
const env = { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD };
const NOW = Date.parse('2026-11-22T12:00:00Z');
const algorithm = { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };

let good: CryptoKeyPair, other: CryptoKeyPair;
beforeAll(async () => {
  good = await crypto.subtle.generateKey(algorithm, true, ['sign', 'verify']);
  other = await crypto.subtle.generateKey(algorithm, true, ['sign', 'verify']);
});
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url !== `${TEAM}/cdn-cgi/access/certs`) return new Response(null, { status: 404 });
    return Response.json({ keys: [{ ...(await crypto.subtle.exportKey('jwk', good.publicKey)), kid: 'key-1', alg: 'RS256' }] });
  }));
});

const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
async function token(claims: object = {}, { key = good.privateKey, kid = 'key-1' } = {}) {
  const unsigned = `${part({ alg: 'RS256', kid })}.${part({ aud: [AUD], iss: TEAM, email: 'a@example.com', exp: NOW / 1000 + 3600, ...claims })}`;
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${Buffer.from(signature).toString('base64url')}`;
}

describe('Access sign-in check', () => {
  it('admits a token signed by the team key for this application', async () => {
    expect(await accessRefusal(await token(), env, NOW)).toBeNull();
  });

  it('refuses a missing token', async () => {
    expect(await accessRefusal(null, env, NOW)).toBe('Sign-in token missing');
  });

  it('refuses an expired token', async () => {
    expect(await accessRefusal(await token({ exp: NOW / 1000 - 1 }), env, NOW)).toBe('Token expired');
  });

  it('refuses a token for another application', async () => {
    expect(await accessRefusal(await token({ aud: ['another-app'] }), env, NOW)).toBe('Token is for another application');
  });

  it('refuses a token signed by another key', async () => {
    expect(await accessRefusal(await token({}, { key: other.privateKey }), env, NOW)).toBe('Bad signature');
    expect(await accessRefusal(await token({}, { kid: 'unknown' }), env, NOW)).toBe('Unknown signing key');
  });

  it('refuses a token from another team and an unsigned token', async () => {
    expect(await accessRefusal(await token({ iss: 'https://other.cloudflareaccess.com' }), env, NOW)).toBe('Token is from another Access team');
    const [, claims] = (await token()).split('.');
    expect(await accessRefusal(`${part({ alg: 'none' })}.${claims}.`, env, NOW)).toBe('Unexpected signing algorithm');
  });

  it('refuses everything when the site has no Access settings', async () => {
    expect(await accessRefusal(await token(), {}, NOW)).toBe('Access is not configured for this site');
  });

  it('guards every library request: 403 without reaching the handler, the handler with a good token', async () => {
    const next = vi.fn(async () => new Response('plans'));
    const context = (headers: HeadersInit) => ({ request: new Request('https://plans.example/api/library', { headers }), env: env as Env, params: {}, next });
    expect((await onRequest(context({}))).status).toBe(403);
    expect(next).not.toHaveBeenCalled();
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    try { expect(await (await onRequest(context({ 'Cf-Access-Jwt-Assertion': await token() }))).text()).toBe('plans'); }
    finally { vi.useRealTimers(); }
  });
});
