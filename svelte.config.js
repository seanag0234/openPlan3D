import nodeAdapter from '@sveltejs/adapter-node';
import staticAdapter from '@sveltejs/adapter-static';

// OPENPLAN_STATIC=true builds plain files for a static host. Its server routes are left out,
// and analytics is forced off because the bundled Firebase keys belong to upstream.
const isStatic = process.env.OPENPLAN_STATIC === 'true';
if (isStatic) process.env.PUBLIC_ENABLE_ANALYTICS = 'false';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		// Cloudflare Pages serves index.html for unknown paths when there is no top-level 404.html.
		adapter: isStatic ? staticAdapter({ fallback: 'index.html' }) : nodeAdapter(),
		// src/service-worker.ts opens the Cloudflare site with no signal. The home server needs its network anyway,
		// and its browser tests route requests that a worker would answer first.
		serviceWorker: { register: isStatic }
	}
};

export default config;
