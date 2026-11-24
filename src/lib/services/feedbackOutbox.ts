import { base } from '$app/paths';

/** A feedback message: the same shape in the outbox, on the wire and in the server's check. */
export interface FeedbackMessage {
  id: string;                 // crypto.randomUUID()
  createdAt: string;          // ISO
  text: string;
  about: string | null;       // the name of what is selected
  planName: string | null;
  context: Record<string, string | number | boolean>;   // page, view, tool, zoom, viewport, orientation, coarse, userAgent, build
  picture: string | null;     // data:image/jpeg;base64,...
}

/** Its own database, apart from the plans: feedback never touches them. */
const DATABASE = 'openplan3d-feedback';
const STORE = 'outbox';

function openOutbox(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => { request.result.createObjectStore(STORE, { keyPath: 'id' }); };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('The feedback outbox is busy in another tab.'));
  });
}

async function withOutbox<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await openOutbox();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = work(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request ? request.result : undefined);
      tx.onabort = tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}

export async function queueFeedback(message: FeedbackMessage): Promise<void> {
  await withOutbox('readwrite', store => { store.put(message); });
}

/** Every message waiting, oldest first. */
export async function pendingFeedback(): Promise<FeedbackMessage[]> {
  const all = (await withOutbox<FeedbackMessage[]>('readonly', store => store.getAll())) ?? [];
  return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

export async function removeFeedback(id: string): Promise<void> {
  await withOutbox('readwrite', store => { store.delete(id); });
}

/** Where the last answer to "does this copy keep feedback?" is kept, as 'true' or 'false'. */
const LAST_KNOWN = 'o3d_feedback_enabled';

function remember(enabled: boolean): boolean {
  try { localStorage.setItem(LAST_KNOWN, String(enabled)); } catch { /* the answer is still given */ }
  return enabled;
}

/** The last answer this copy gave, or null when it has never answered here or it cannot be read. */
export function lastKnownFeedbackEnabled(): boolean | null {
  try {
    const value = localStorage.getItem(LAST_KNOWN);
    return value === 'true' ? true : value === 'false' ? false : null;
  } catch { return null; }
}

/**
 * Whether this copy keeps feedback: true or false when it answered (404 is a copy without the route,
 * 503 one without a folder), null when the question got no answer (no connection, or any other status).
 */
export async function feedbackEnabled(): Promise<boolean | null> {
  let response: Response;
  try { response = await fetch(`${base}/api/feedback`, { cache: 'no-store' }); }
  catch { return null; }
  if (response.status === 404 || response.status === 503) return remember(false);
  if (response.status !== 200) return null;
  let body: unknown = null;
  try { body = await response.json(); } catch { /* anything but { enabled: true } is no */ }
  return remember((body as { enabled?: unknown } | null)?.enabled === true);
}

/** Post one message; the status, or 0 when the request did not get an answer. */
async function postFeedback(message: FeedbackMessage): Promise<number> {
  try {
    const response = await fetch(`${base}/api/feedback`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(message), cache: 'no-store',
    });
    return response.status;
  } catch { return 0; }
}

let flushing: Promise<unknown> = Promise.resolve();

/** One flush at a time, here and, where the browser can, across this copy's tabs. The lock callback never
 *  rejects (Firefox reports one that does as an uncaught error): the outcome is carried out and rethrown. */
function exclusively<T>(work: () => Promise<T>): Promise<T> {
  const locked = async () => {
    const outcome = await navigator.locks.request('openplan3d-feedback-outbox', async () => {
      try { return { ok: true as const, value: await work() }; }
      catch (error) { return { ok: false as const, error }; }
    });
    if (!outcome.ok) throw outcome.error;
    return outcome.value;
  };
  const run = () => (typeof navigator !== 'undefined' && typeof navigator.locks?.request === 'function' ? locked() : work());
  const next = flushing.then(run, run);
  flushing = next.catch(() => {});
  return next;
}

/** Try to deliver everything waiting, oldest first. A message leaves the outbox only on 200 or 201. */
export function flushFeedback(post: (message: FeedbackMessage) => Promise<number> = postFeedback): Promise<{ sent: number; waiting: number }> {
  return exclusively(async () => {
    let sent = 0, waiting = 0;
    for (const message of await pendingFeedback()) {
      let status = 0;
      try { status = await post(message); } catch { status = 0; }
      if (status === 200 || status === 201) { await removeFeedback(message.id); sent++; }
      // A 400 can never be taken: keeping it would block nothing but would wait forever.
      else if (status === 400) await removeFeedback(message.id);
      else waiting++;
    }
    return { sent, waiting };
  });
}
