import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import { isAbsolute } from 'node:path';
import { FeedbackRejected, writeFeedback } from '$lib/server/feedbackFiles';

const headers = { 'Cache-Control': 'no-store' };
const folder = () => (env.FEEDBACK_DIR && isAbsolute(env.FEEDBACK_DIR) ? env.FEEDBACK_DIR : null);

/** Whether this copy keeps feedback: FEEDBACK_DIR names an absolute folder. */
export function GET() {
  return json({ enabled: folder() !== null }, { headers });
}

/** Keep one message as a file in FEEDBACK_DIR. A message's words and picture are never logged. */
export async function POST({ request, url }: { request: Request; url: URL }) {
  const dir = folder();
  if (!dir) return json({ error: 'This copy of the editor has nowhere to keep feedback.' }, { status: 503, headers });
  const origin = request.headers.get('origin');
  if (origin !== null) {
    let host: string | null = null;
    try { host = new URL(origin).host; } catch { /* "null" and other non-URLs come from no page of this copy. */ }
    if (host !== url.host) return json({ error: 'Feedback is taken only from this copy’s own pages.' }, { status: 403, headers });
  }
  try {
    let body: unknown;
    try { body = await request.json(); } catch { throw new FeedbackRejected(400, 'The message is not valid JSON.'); }
    const { duplicate } = await writeFeedback(dir, body);
    return json({ ok: true }, { status: duplicate ? 200 : 201, headers });
  } catch (error) {
    if (error instanceof FeedbackRejected) return json({ error: error.message }, { status: error.status, headers });
    console.error(JSON.stringify({ event: 'feedback_unavailable', code: (error as NodeJS.ErrnoException)?.code ?? null }));
    return json({ error: 'Feedback could not be kept. It will be sent again later.' }, { status: 500, headers });
  }
}
