import type { Env } from './_shared';

type Jwk = JsonWebKey & { kid?: string };

const bytes = (part: string) => {
  const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')), c => c.charCodeAt(0));
};
const decode = (part: string) => JSON.parse(new TextDecoder().decode(bytes(part)));

let cache: { url: string; at: number; keys: Jwk[] } | null = null;

async function signingKey(url: string, kid: unknown, now: number): Promise<Jwk | undefined> {
  const fresh = cache?.url === url && now - cache.at < 10 * 60_000;
  let key = fresh ? cache!.keys.find(k => k.kid === kid) : undefined;
  // A miss refetches, so a key Cloudflare has just rotated in is found without waiting for the cache to expire.
  if (!key) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Access keys returned ${response.status}`);
    cache = { url, at: now, keys: ((await response.json()) as { keys: Jwk[] }).keys };
    key = cache.keys.find(k => k.kid === kid);
  }
  return key;
}

/**
 * Why the Cloudflare Access sign-in token does not admit this request, or null when it does.
 * Checked on every request, behind the Access gate as well, so a route the gate does not cover stays closed.
 */
export async function accessRefusal(token: string | null, env: Pick<Env, 'ACCESS_TEAM_DOMAIN' | 'ACCESS_AUD'>, now = Date.now()): Promise<string | null> {
  const team = env.ACCESS_TEAM_DOMAIN?.replace(/\/+$/, ''), audience = env.ACCESS_AUD;
  if (!team || !audience) return 'Access is not configured for this site';
  if (!token) return 'Sign-in token missing';
  const parts = token.split('.');
  if (parts.length !== 3) return 'Malformed sign-in token';
  let header, claims;
  try { [header, claims] = [decode(parts[0]), decode(parts[1])]; } catch { return 'Malformed sign-in token'; }
  if (header?.alg !== 'RS256') return 'Unexpected signing algorithm';
  let jwk;
  try { jwk = await signingKey(`${team}/cdn-cgi/access/certs`, header.kid, now); }
  catch { return 'Could not load the Access signing keys'; }
  if (!jwk) return 'Unknown signing key';
  let valid = false;
  try {
    const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, bytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  } catch {}
  if (!valid) return 'Bad signature';
  if (!(Array.isArray(claims?.aud) ? claims.aud : [claims?.aud]).includes(audience)) return 'Token is for another application';
  if (claims.iss !== team) return 'Token is from another Access team';
  if (typeof claims.exp !== 'number' || claims.exp * 1000 <= now) return 'Token expired';
  if (typeof claims.nbf === 'number' && claims.nbf * 1000 > now + 60_000) return 'Token not valid yet';
  return null;
}
