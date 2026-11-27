import { caller, roleOf } from '../_people';
import { MAX_THUMBNAIL_BYTES, readLimited, status, type Context } from '../_shared';

/** A preview does not change the plan, so it needs no revision and does not bump one. */
export async function onRequestPut({ request, env, params }: Context<'id'>) {
  if (!await roleOf(env.LIBRARY, params.id, caller(request))) return status(404);
  const thumbnail = await readLimited(request, MAX_THUMBNAIL_BYTES);
  if (thumbnail === null) return status(413, 'Preview too large');
  if (!thumbnail.startsWith('data:image/')) return status(400, 'The body must be an image data URL');
  const { meta } = await env.LIBRARY.prepare('UPDATE projects SET thumbnail = ? WHERE id = ?').bind(thumbnail, params.id).run();
  return status(meta.changes ? 204 : 404);
}

