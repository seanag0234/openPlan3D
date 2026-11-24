/**
 * The newest Undo and Redo steps of a plan, kept beside the plan after each save so they come back when the page
 * is reloaded (a tablet reloads a tab by itself when memory runs short). They live in a database of their own: the
 * plan library's backups copy the library's stores, and a backup has no use for them.
 */
import type { UndoEntry } from '$lib/stores/project';

export const JOURNAL_STEPS = 10;
export const JOURNAL_MAX_CHARS = 4_000_000;

export interface UndoJournal {
  v: 1;
  /** ISO time of the plan these steps belong to. */
  planUpdatedAt: string;
  writtenAt: number;
  /** That plan, packed. */
  current: string;
  undo: UndoEntry[];
  redo: UndoEntry[];
  /** token -> string, for every token in current, undo and redo. */
  shared: Record<string, string>;
}

/** The steps to keep for a plan, or null when there are none or they cannot be written whole. */
export function buildJournal(input: {
  planUpdatedAt: string; current: string; undo: UndoEntry[]; redo: UndoEntry[];
  tokens: (state: string) => string[]; text: (token: string) => string | undefined; now: number;
}, maxChars = JOURNAL_MAX_CHARS): UndoJournal | null {
  const undo = input.undo.slice(-JOURNAL_STEPS);
  const redo = input.redo.slice(-JOURNAL_STEPS);
  if (!undo.length && !redo.length) return null;
  const collect = () => {
    const shared: Record<string, string> = {};
    for (const state of [input.current, ...undo.map(e => e.state), ...redo.map(e => e.state)]) {
      for (const token of input.tokens(state)) {
        if (token in shared) continue;
        const text = input.text(token);
        if (text === undefined) return null;
        shared[token] = text;
      }
    }
    return shared;
  };
  const size = (shared: Record<string, string>) => input.current.length
    + undo.reduce((sum, e) => sum + e.state.length, 0)
    + redo.reduce((sum, e) => sum + e.state.length, 0)
    + Object.values(shared).reduce((sum, text) => sum + text.length, 0);
  let shared = collect();
  if (!shared) return null;
  while (size(shared) > maxChars) {
    if (undo.length > 1) undo.shift();
    else if (redo.length) redo.shift();
    else return null;
    shared = collect()!;
  }
  if (!undo.length && !redo.length) return null;
  return { v: 1, planUpdatedAt: input.planUpdatedAt, writtenAt: input.now, current: input.current, undo, redo, shared };
}

const isEntry = (value: unknown): value is UndoEntry => {
  const e = value as Partial<UndoEntry> | null;
  return !!e && typeof e === 'object' && typeof e.state === 'string'
    && typeof e.description === 'string' && typeof e.timestamp === 'number';
};

/** The steps a stored journal gives back for the plan as it was loaded, or null when they do not belong to it. */
export function journalFor(journal: unknown, planUpdatedAt: string):
  { undo: UndoEntry[]; redo: UndoEntry[]; shared: Record<string, string> } | null {
  const j = journal as Partial<UndoJournal> | null;
  if (!j || typeof j !== 'object' || j.v !== 1) return null;
  if (typeof j.planUpdatedAt !== 'string' || typeof j.current !== 'string' || typeof j.writtenAt !== 'number') return null;
  if (!Array.isArray(j.undo) || !Array.isArray(j.redo) || !j.undo.every(isEntry) || !j.redo.every(isEntry)) return null;
  if (!j.shared || typeof j.shared !== 'object' || Array.isArray(j.shared)) return null;
  if (!Object.values(j.shared).every(text => typeof text === 'string')) return null;
  const written = Date.parse(j.planUpdatedAt), plan = Date.parse(planUpdatedAt);
  if (!Number.isFinite(written) || !Number.isFinite(plan) || written > plan) return null;
  const shared = { ...j.shared } as Record<string, string>;
  if (written === plan) return { undo: [...j.undo], redo: [...j.redo], shared };
  // A save landed after these steps were written (the last-moment copy of a page that went away): the plan the
  // journal was written for is then one Undo before the plan that was loaded.
  const undo = [...j.undo, { state: j.current, description: 'Edit', timestamp: j.writtenAt }].slice(-JOURNAL_STEPS);
  return { undo, redo: [], shared };
}

const DATABASE = 'openplan3d-undo';
const STORE = 'journal';

function openJournal(): Promise<IDBDatabase | null> {
  return new Promise(resolve => {
    let factory: IDBFactory | undefined;
    try { factory = typeof indexedDB === 'undefined' ? undefined : indexedDB; } catch { factory = undefined; }
    if (!factory) return resolve(null);
    try {
      const open = factory.open(DATABASE, 1);
      open.onupgradeneeded = () => {
        if (!open.result.objectStoreNames.contains(STORE)) open.result.createObjectStore(STORE);
      };
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => resolve(null);
      open.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
}

/** Run one request in its own transaction; resolves with its result once the transaction has committed. */
async function run<T>(mode: IDBTransactionMode, make: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  const db = await openJournal();
  if (!db) return undefined;
  try {
    return await new Promise<T | undefined>((resolve) => {
      let result: T | undefined;
      try {
        const tx = db.transaction(STORE, mode);
        const req = make(tx.objectStore(STORE));
        req.onsuccess = () => { result = req.result; };
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => resolve(undefined);
        tx.onabort = () => resolve(undefined);
      } catch { resolve(undefined); }
    });
  } finally {
    try { db.close(); } catch {}
  }
}

/** Keep these steps for the plan; null removes them. Never rejects. */
export async function writeUndoJournal(projectId: string, journal: UndoJournal | null): Promise<void> {
  try {
    if (!journal) return await deleteUndoJournal(projectId);
    const text = JSON.stringify(journal);
    await run('readwrite', store => store.put(text, projectId));
  } catch {}
}

/** The stored journal of a plan, parsed, or null when there is none. Never rejects. */
export async function readUndoJournal(projectId: string): Promise<unknown> {
  try {
    const text = await run<unknown>('readonly', store => store.get(projectId));
    return typeof text === 'string' ? JSON.parse(text) : null;
  } catch { return null; }
}

/** Never rejects. */
export async function deleteUndoJournal(projectId: string): Promise<void> {
  try { await run('readwrite', store => store.delete(projectId)); } catch {}
}
