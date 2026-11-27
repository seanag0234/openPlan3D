import type { Context } from './_shared';

/** Plans whose newest logged entry is a delete, newest delete first, each with the last save to bring back. */
export async function onRequestGet({ env }: Context) {
  const { results } = await env.LIBRARY.prepare(`
    SELECT v.project_id AS id, v.name, v.saved_at AS deletedAt,
      (SELECT MAX(seq) FROM versions s WHERE s.project_id = v.project_id AND s.body IS NOT NULL) AS seq
    FROM versions v
    WHERE v.body IS NULL
      AND v.seq = (SELECT MAX(seq) FROM versions l WHERE l.project_id = v.project_id)
      AND NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = v.project_id)
    ORDER BY v.seq DESC LIMIT 100`).all();
  return Response.json(results, { headers: { 'Cache-Control': 'no-store' } });
}

