import { env } from '$env/dynamic/private';
import { open } from 'node:fs/promises';
import { isAbsolute } from 'node:path';

/** A plan larger than this is not served: the browser would have to hold all of it. */
const MAX_BYTES = 20 * 1024 * 1024;
const headers = { 'Cache-Control': 'no-store' };

/**
 * The plan this copy opens for a browser with no plans: the file named by START_PLAN_FILE.
 * Any problem answers 204 (a 404 would print a console error), and the path never appears in an answer.
 */
async function readStartPlan(): Promise<Uint8Array | null> {
  const path = env.START_PLAN_FILE;
  if (!path || !isAbsolute(path)) return null;
  try {
    const file = await open(path, 'r');
    try {
      const info = await file.stat();
      if (!info.isFile() || info.size > MAX_BYTES) return null;
      return new Uint8Array(await file.readFile());
    } finally { await file.close(); }
  } catch { return null; }
}

async function available(): Promise<boolean> {
  const path = env.START_PLAN_FILE;
  if (!path || !isAbsolute(path)) return false;
  try {
    const file = await open(path, 'r');
    try { const info = await file.stat(); return info.isFile() && info.size <= MAX_BYTES; }
    finally { await file.close(); }
  } catch { return false; }
}

export async function GET({ url }: { url: URL }) {
  if (url.searchParams.has('info')) {
    return new Response(JSON.stringify({ available: await available() }), { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } });
  }
  const bytes = await readStartPlan();
  if (!bytes) return new Response(null, { status: 204, headers });
  return new Response(bytes, { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } });
}
