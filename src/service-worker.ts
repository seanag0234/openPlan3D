/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
// Lets the editor open with no signal. Plans never pass through here: they live in this browser's IndexedDB and
// /api/library, which this worker leaves alone, as it does the Access sign-in under /cdn-cgi/.
import { build, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE = `openplan3d-${version}`;
const PAGE = '/';
const built = new Set(build);
// A page on a weak signal opens from the copy kept here after this long, and the network's answer refreshes it.
const NETWORK_WAIT_MS = 4000;

sw.addEventListener('install', event => {
  // Every built file, so a part of the editor never opened before still loads with no signal.
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll([PAGE, '/_app/env.js', ...build])).then(() => sw.skipWaiting()));
});

sw.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name !== CACHE) await caches.delete(name);
    await sw.clients.claim();
  })());
});

sw.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== sw.location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/cdn-cgi/')) return;
  event.respondWith(respond(event, url));
});

/** Only a plain answer from this site is kept: never a sign-in redirect or an error. */
function keep(event: FetchEvent, cache: Cache, key: RequestInfo, response: Response) {
  if (response.ok && response.type === 'basic') {
    const stored = cache.put(key, response.clone()).catch(() => {});
    // A page already answered from the kept copy may have let the event end.
    try { event.waitUntil(stored); } catch {}
  }
  return response;
}

async function respond(event: FetchEvent, url: URL): Promise<Response> {
  const { request } = event;
  const cache = await caches.open(CACHE);
  // Built files are named by their content, so a kept one is always right.
  if (built.has(url.pathname)) return (await cache.match(url.pathname)) ?? keep(event, cache, url.pathname, await fetch(request));
  // Every page is the same app (the build's fallback index.html), kept under one name.
  const key = request.mode === 'navigate' ? PAGE : request;
  const network = fetch(request).then(response => keep(event, cache, key, response));
  const cached = await cache.match(key);
  if (!cached) return network;
  network.catch(() => {});
  if (request.mode !== 'navigate') return network.catch(() => cached);
  const slow = new Promise<Response>(resolve => setTimeout(() => resolve(cached), NETWORK_WAIT_MS));
  return Promise.race([network.catch(() => cached), slow]);
}
