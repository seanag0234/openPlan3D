import type { Context } from './_shared';

export async function onRequestGet({ env }: Context) {
  const { results } = await env.LIBRARY
    .prepare('SELECT id, name, updated_at AS updatedAt, revision, thumbnail FROM projects ORDER BY updated_at DESC')
    .all();
  return Response.json(results, { headers: { 'Cache-Control': 'no-store' } });
}
