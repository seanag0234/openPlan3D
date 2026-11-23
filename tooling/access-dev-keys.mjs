// A stand-in for Cloudflare Access when the plan library runs under `npm run pages:dev`. It holds a key pair
// made at start-up, publishes the public half where Access publishes its keys, and signs sign-in tokens.
//
//   node tooling/access-dev-keys.mjs 8793 local-dev
//   npm run pages:dev -- --d1 LIBRARY=local-library \
//     --binding ACCESS_TEAM_DOMAIN=http://127.0.0.1:8793 --binding ACCESS_AUD=local-dev
//
// Send the text of http://127.0.0.1:8793/token as the Cf-Access-Jwt-Assertion header, which Access adds in production.
// The deployed site never sees this server: Pulumi sets the real team domain and audience on the Pages project.
import { createServer } from 'node:http';

const [port = '8793', audience = 'local-dev'] = process.argv.slice(2);
const issuer = `http://127.0.0.1:${port}`;
const { publicKey, privateKey } = await crypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...(await crypto.subtle.exportKey('jwk', publicKey)), kid: 'local', alg: 'RS256' };
const part = value => Buffer.from(JSON.stringify(value)).toString('base64url');

async function token(email) {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${part({ alg: 'RS256', kid: 'local' })}.${part({ aud: [audience], iss: issuer, email, iat: now, exp: now + 3600 })}`;
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(unsigned));
  return `${unsigned}.${Buffer.from(signature).toString('base64url')}`;
}

createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', issuer);
  if (url.pathname === '/cdn-cgi/access/certs') {
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ keys: [jwk] }));
  } else if (url.pathname === '/token') {
    response.end(await token(url.searchParams.get('email') ?? 'dev@example.com'));
  } else {
    response.statusCode = 404;
    response.end();
  }
}).listen(Number(port), '127.0.0.1', () => console.log(`Access stand-in on ${issuer} for audience ${audience}`));
