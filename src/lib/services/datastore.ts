import { readProject } from '$lib/utils/projectValidation';
import type { Project } from '$lib/models/types';
import { withDatabase, transaction, request, records, readRecord, libraryBackup, notifyLibraryChange } from './localDatabase';
import { requestPersistentStorage } from './storagePersistence';
import { deleteUndoJournal } from './undoJournal';
export { PROJECTS_STORAGE_KEY, LIBRARY_CHANGE_KEY } from './localDatabase';

export interface DataStore {
  has(id: string): Promise<boolean>;
  assertCurrent(id: string): Promise<void>;
  saveCopy(project: Project, suffix?: string): Promise<Project>;
  save(project: Project): Promise<void>;
  load(id: string): Promise<Project | null>;
  /** `sharedBy` names who shared a plan with this person; `everyone` marks one nobody owns. Online library only. */
  list(): Promise<{ id: string; name: string; updatedAt: string; sharedBy?: string | null; everyone?: boolean }[]>;
  delete(id: string): Promise<void>;
  duplicate(id: string): Promise<Project | null>;
  saveThumbnail(id: string, dataUrl: string): Promise<void>;
  getThumbnail(id: string): Promise<string | null>;
  getThumbnails(): Promise<Record<string, string>>;
  /** For a page going away before its save could finish: a copy the next load of this plan picks up. Synchronous. */
  stashUnsaved(project: Project): void;
  /** Online library only: sends up every plan saved in this browser alone, from this page or an earlier one. */
  uploadPending?(): void;
}

const UNSAVED_PREFIX = 'o3d_unsaved:';

/** Which stored text a copy was made on top of: its length and FNV-1a hash. */
function stamp(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${text.length}:${hash.toString(16)}`;
}

function readUnsaved(id: string): { base: string; raw: string } | null | undefined {
  try {
    const text = localStorage.getItem(UNSAVED_PREFIX + id);
    if (text === null) return undefined;
    const copy = JSON.parse(text);
    return copy && typeof copy.base === 'string' && typeof copy.raw === 'string' ? { base: copy.base, raw: copy.raw } : null;
  } catch { return null; }
}

function removeUnsaved(id: string) {
  try { localStorage.removeItem(UNSAVED_PREFIX + id); } catch {}
}


export class ProjectConflictError extends Error {
  constructor() {
    super('This plan changed or was deleted in another tab. Save your version as a copy, or download a copy of it, to keep both.');
    this.name = 'ProjectConflictError';
  }
}

/** Keep in-document saves ordered; IndexedDB transactions also protect browsers without Web Locks.
 *  The lock callback never rejects: Firefox reports a lock callback that rejects at once (indexedDB.open with
 *  site data blocked) as an uncaught error even though the request's promise is handled, so the outcome is
 *  carried out of the lock and rethrown here. */
async function mutateLibrary<T>(change: () => Promise<T>): Promise<T> {
  if (typeof window !== 'undefined' && typeof navigator !== 'undefined' && navigator.locks?.request) {
    const outcome = await navigator.locks.request('openplan3d-project-library', async () => {
      try { return { ok: true as const, value: await change() }; }
      catch (error) { return { ok: false as const, error }; }
    });
    if (!outcome.ok) throw outcome.error;
    return outcome.value;
  }
  // IndexedDB compare-and-write transactions remain atomic without Web Locks.
  return change();
}

export function storageErrorMessage(error: unknown): string {
  const e = error as { name?: string; code?: number; message?: string } | null;
  if (e?.name === 'QuotaExceededError' || e?.code === 22 || e?.code === 1014) {
    return 'Browser storage is full. Download your project as JSON, then free space by deleting projects you have backed up.';
  }
  if (e?.name === 'SecurityError') {
    return 'Browser storage is unavailable. Allow site storage or download your project as JSON.';
  }
  return e?.message || 'Could not save to browser storage. Download your project as JSON to keep a copy.';
}

/** Preserve the original bytes, including a damaged library, for manual recovery. */
export async function downloadLibraryBackup() {
  const raw = await libraryBackup();
  const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'openplan3d-library-backup.json';
  link.click();
  URL.revokeObjectURL(url);
}

function validCopy(id: string, raw: string): boolean {
  try { return readProject(JSON.parse(raw)).id === id; } catch { return false; }
}

/** Each browser document remembers only revisions it actually opened or saved. */
export function createLocalStore(): DataStore {
  const opened = new Map<string, string | null>();
  const listed = new Map<string, string>();
  const generations = new Map<string, number>();
  const check = (id: string, raw: string | null) => {
    if (raw !== (opened.get(id) ?? null)) throw new ProjectConflictError();
  };
  return {
    async has(id) { return (await readRecord('projects', id)) !== null; },

    async assertCurrent(id) { check(id, await readRecord('projects', id)); },

    async save(project) {
      const id = project.id, raw = JSON.stringify(project), generation = generations.get(id);
      await mutateLibrary(async () => {
        await withDatabase(db => transaction(db, ['projects'], 'readwrite', async tx => {
          const projects = tx.objectStore('projects');
          const stored = (await request(projects.get(id))) ?? null;
          if (generation !== generations.get(id)) throw new ProjectConflictError();
          check(id, stored);
          projects.put(raw, id);
        }));
        // A successful request alone is not a committed transaction.
        opened.set(id, raw);
        notifyLibraryChange(id);
      });
      removeUnsaved(id);
      // Committed work can now ask the browser to keep the library; the save never waits.
      void requestPersistentStorage();
    },

    async saveCopy(project, suffix = 'Recovered copy') {
      const copy = readProject(project);
      copy.name = `${copy.name || 'Untitled Project'} (${suffix})`;
      copy.createdAt = copy.updatedAt = new Date();
      return mutateLibrary(async () => {
        await withDatabase(db => transaction(db, ['projects'], 'readwrite', async tx => {
          const projects = tx.objectStore('projects');
          let attempts = 0;
          do {
            if (++attempts > 5) throw new Error('Could not choose a new project ID. Try saving a copy again.');
            copy.id = globalThis.crypto?.randomUUID?.() ?? `project-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
          } while (await request(projects.get(copy.id)) !== undefined);
          projects.add(JSON.stringify(copy), copy.id);
        }));
        opened.set(copy.id, JSON.stringify(copy));
        notifyLibraryChange(copy.id);
        void requestPersistentStorage();
        return copy;
      });
    },

    async load(id) {
      // Invalidate queued saves immediately, including while this read is waiting.
      generations.set(id, (generations.get(id) ?? 0) + 1);
      let raw = await readRecord('projects', id);
      if (raw === null) { opened.set(id, null); return null; }
      raw = await takeUnsaved(id, raw);
      const project = readProject(JSON.parse(raw));
      if (project.id !== id) throw new Error('The saved project ID does not match its library entry. Download a library backup before recovery.');
      opened.set(id, raw);
      return project;
    },

    async list() {
      const all = await withDatabase(db => transaction(db, ['projects'], 'readonly', tx => records(tx, 'projects')));
      const projects = Object.entries(all).map(([id, raw]) => {
        try {
          const p = JSON.parse(raw);
          if (!p || typeof p.name !== 'string' || typeof p.updatedAt !== 'string' || !Number.isFinite(Date.parse(p.updatedAt))) throw new Error();
          return { id, name: p.name, updatedAt: p.updatedAt };
        } catch {
          // Keep damaged entries visible and deletable without hiding healthy or
          // restored projects. Opening still validates; backups retain raw bytes.
          return { id, name: `Unreadable project — ${id}`, updatedAt: new Date(0).toISOString() };
        }
      });
      listed.clear();
      for (const [id, raw] of Object.entries(all)) listed.set(id, raw);
      return projects;
    },

    async delete(id) {
      await mutateLibrary(async () => {
        await withDatabase(db => transaction(db, ['projects', 'thumbnails', 'history'], 'readwrite', async tx => {
          const projects = tx.objectStore('projects');
          const expected = listed.has(id) ? listed.get(id) : opened.get(id);
          if (((await request(projects.get(id))) ?? null) !== (expected ?? null)) throw new ProjectConflictError();
          projects.delete(id);
          tx.objectStore('thumbnails').delete(id);
          tx.objectStore('history').delete(id);
        }));
        // Retain the opened revision so this editor cannot recreate a deleted plan.
        listed.delete(id);
        notifyLibraryChange(id);
      });
      removeUnsaved(id);
      // The plan's kept Undo steps go with it; they never hold the delete up.
      void deleteUndoJournal(id).catch(() => {});
    },

    async duplicate(id) {
      // Copying is not opening, so this tab's record of the original stays as it is: a save the
      // editor queued on the way out must still land, not fail as a conflict. Waiting for queued
      // library writes first lets the copy include those edits.
      await mutateLibrary(async () => {});
      const raw = await readRecord('projects', id);
      if (raw === null) return null;
      const original = readProject(JSON.parse(raw));
      if (original.id !== id) throw new Error('The saved project ID does not match its library entry. Download a library backup before recovery.');
      const dup = await this.saveCopy(original, 'Copy');
      const thumb = await this.getThumbnail(id);
      if (thumb) await this.saveThumbnail(dup.id, thumb);
      return dup;
    },

    async saveThumbnail(id, dataUrl) {
      const expected = opened.get(id);
      try {
        await withDatabase(db => transaction(db, ['projects', 'thumbnails'], 'readwrite', async tx => {
          if (expected === undefined || expected === null || await request(tx.objectStore('projects').get(id)) !== expected) return;
          tx.objectStore('thumbnails').put(dataUrl, id);
        }));
      } catch {} // Previews are optional; a failed preview cannot invalidate a saved plan.
    },

    async getThumbnail(id) {
      try { return await readRecord('thumbnails', id); } catch { return null; }
    },

    async getThumbnails() {
      try { return await withDatabase(db => transaction(db, ['thumbnails'], 'readonly', tx => records(tx, 'thumbnails'))); }
      catch { return {}; }
    },

    stashUnsaved(project) {
      try {
        const base = opened.get(project.id);
        if (base === undefined || base === null) return;
        localStorage.setItem(UNSAVED_PREFIX + project.id, JSON.stringify({ base: stamp(base), raw: JSON.stringify(project) }));
      } catch {} // A full or missing localStorage leaves only the regular save.
    },
  };

  /** The text to open for a plan: the copy a page left on its way out when it was made on top of the stored text,
   *  written as the stored plan first; otherwise the stored text. */
  async function takeUnsaved(id: string, stored: string): Promise<string> {
    const copy = readUnsaved(id);
    if (copy === undefined) return stored;
    if (!copy || copy.base !== stamp(stored) || copy.raw === stored || !validCopy(id, copy.raw)) {
      removeUnsaved(id);
      return stored;
    }
    try {
      await mutateLibrary(async () => {
        await withDatabase(db => transaction(db, ['projects'], 'readwrite', async tx => {
          const projects = tx.objectStore('projects');
          if (((await request(projects.get(id))) ?? null) !== stored) throw new ProjectConflictError();
          projects.put(copy.raw, id);
        }));
        notifyLibraryChange(id);
      });
    } catch { return stored; } // Kept for the next load.
    removeUnsaved(id);
    return copy.raw;
  }
}

export const localStore = createLocalStore();

export const LIBRARY_TOO_LARGE = 'This plan is too large for the online library, so it is kept in this browser only. Download a JSON backup to move it to another device.';
export const LIBRARY_NOT_SHARED = 'This plan is no longer shared with you, so this change is kept in this browser only. Duplicate it to keep your own copy online.';
export const LIBRARY_UNREACHABLE = 'The online library could not be reached, so this change is kept in this browser only. Retry when you are online.';
/** A save, unlike a delete, goes online by itself once the signal is back. */
export const LIBRARY_WAITING = 'No signal: this change is saved in this browser, and goes to the online library by itself when the signal is back.';

/** The browser copy is saved; the online library did not take the change. */
export class LibraryLocalOnlyError extends Error {
  constructor(message: string) { super(message); this.name = 'LibraryLocalOnlyError'; }
}

type RemoteEntry = { id: string; name: string; updatedAt: string; revision: number; thumbnail: string | null; sharedBy?: string | null; everyone?: boolean };
/** Per plan: the library revision this browser's copy came from, and whether it holds edits the library lacks. */
type Sync = Record<string, { revision?: number; pending?: boolean }>;
const LIBRARY_SYNC_KEY = 'o3d_library_sync';

const time = (value: unknown) => new Date(value as string).getTime();
const revisionOf = (response: Response) => Number(response.headers.get('ETag')?.replaceAll('"', ''));

/**
 * The browser library plus the site's online library (functions/api/library). Every change lands in the
 * browser first, then online; a stale online save is a ProjectConflictError, as a stale tab's is.
 */
export function createLibraryStore(local: DataStore, options: {
  url?: string; fetch?: typeof fetch; storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
} = {}): DataStore {
  const url = options.url ?? '/api/library';
  const send: typeof fetch = options.fetch ?? ((input, init) => fetch(input, init));
  const storage = () => options.storage !== undefined ? options.storage : globalThis.localStorage;
  let listed = new Map<string, RemoteEntry>();

  const sync = (): Sync => { try { return JSON.parse(storage()?.getItem(LIBRARY_SYNC_KEY) ?? '{}') ?? {}; } catch { return {}; } };
  const remember = (id: string, state: Sync[string] | undefined) => {
    const all = sync();
    if (state) all[id] = state; else delete all[id];
    try { storage()?.setItem(LIBRARY_SYNC_KEY, JSON.stringify(all)); } catch {}
  };

  /** null: the library could not be reached, or refused the sign-in. */
  async function call(path: string, init?: RequestInit): Promise<Response | null> {
    try { return await send(`${url}${path}`, { cache: 'no-store', ...init }); } catch { return null; }
  }
  const at = (id: string) => `/${encodeURIComponent(id)}`;

  async function remoteList(): Promise<RemoteEntry[] | null> {
    const response = await call('');
    if (!response?.ok) return null;
    const entries = (await response.json()) as RemoteEntry[];
    listed = new Map(entries.map(entry => [entry.id, entry]));
    return entries;
  }

  /** undefined when unreachable, null when the library has no such plan. */
  async function remoteGet(id: string): Promise<{ project: Project; revision: number } | null | undefined> {
    const response = await call(at(id));
    if (response?.status === 404) return null;
    if (!response?.ok) return undefined;
    const project = readProject(await response.json());
    if (project.id !== id) throw new Error('The saved project ID does not match its library entry. Download a library backup before recovery.');
    return { project, revision: revisionOf(response) };
  }

  /** The newer copy wins, except that a browser copy with nothing new gives way to any later library revision. */
  function remoteWins(id: string, remote: { revision: number; updatedAt: unknown }, mine?: { updatedAt: unknown }) {
    if (!mine) return true;
    const state = sync()[id];
    if (state?.revision === remote.revision) return false;
    return state && !state.pending ? true : time(remote.updatedAt) > time(mine.updatedAt);
  }

  // One request to the library at a time, each sent with the revision the one before it got back: two saves
  // in flight at once carry the same revision, and the library refuses the second as a conflict.
  let queue: Promise<unknown> = Promise.resolve();
  const newest = new Map<string, Project>();
  function serially<T>(work: () => Promise<T>): Promise<T> {
    const run = queue.then(work);
    queue = run.catch(() => {});
    return run;
  }
  /** A save overtaken by a newer one of the same plan before its turn leaves the upload to that one. */
  function upload(project: Project): Promise<void> {
    newest.set(project.id, project);
    return serially(async () => {
      if (newest.get(project.id) !== project) return;
      try { await putOnline(project); } finally { if (newest.get(project.id) === project) newest.delete(project.id); }
    });
  }

  /** This browser's copy of a plan the library lacks or is behind on (edits made with no signal, a restored backup,
   *  an imported package, a plan from before the library) goes up without waiting for an edit. Read at its turn,
   *  so it is the newest copy; a plan the library already took, or one a save is uploading, is left alone. */
  function uploadStored(id: string) {
    void serially(async () => {
      const state = sync()[id];
      if (newest.has(id) || (state && !state.pending)) return;
      const raw = await readRecord('projects', id);
      if (raw !== null) await putOnline(readProject(JSON.parse(raw)));
    }).catch(() => {});
  }

  async function putOnline(project: Project) {
    const known = sync()[project.id]?.revision;
    const response = await call(at(project.id), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...(known === undefined ? { 'If-None-Match': '*' } : { 'If-Match': `"${known}"` }) },
      body: JSON.stringify(project),
    });
    if (response?.ok) { remember(project.id, { revision: revisionOf(response) }); return; }
    remember(project.id, { revision: known, pending: true });
    if (response?.status === 412) throw new ProjectConflictError();
    throw new LibraryLocalOnlyError(response?.status === 413 ? LIBRARY_TOO_LARGE : response?.status === 403 ? LIBRARY_NOT_SHARED : LIBRARY_WAITING);
  }

  return {
    async has(id) { return await local.has(id) || !!(await remoteList())?.some(entry => entry.id === id); },

    assertCurrent: id => local.assertCurrent(id),

    async save(project) {
      await local.save(project);
      await upload(project);
    },

    uploadPending() {
      for (const [id, state] of Object.entries(sync())) if (state.pending) uploadStored(id);
    },

    async saveCopy(project, suffix) {
      const copy = await local.saveCopy(project, suffix);
      // The edits now live in the copy, so the original follows the library again on its next open.
      const original = sync()[project.id];
      if (original?.pending) remember(project.id, { revision: original.revision });
      // shortcut: a copy the library did not take is uploaded by its next save, which needs an edit.
      await upload(copy).catch(() => {});
      return copy;
    },

    async load(id) {
      const remote = await remoteGet(id);
      const mine = await local.load(id);
      if (!remote || !remoteWins(id, { revision: remote.revision, updatedAt: remote.project.updatedAt }, mine ?? undefined)) {
        if (remote !== undefined && mine) uploadStored(id);
        return mine;
      }
      await local.save(remote.project);
      remember(id, { revision: remote.revision });
      return remote.project;
    },

    async list() {
      const mine = await local.list(), remote = await remoteList();
      if (!remote) return mine;
      const merged = new Map(mine.map(entry => [entry.id, entry]));
      for (const entry of mine) uploadStored(entry.id);
      for (const entry of remote) {
        const { sharedBy = null, everyone = false } = entry;
        const shown = remoteWins(entry.id, entry, merged.get(entry.id)) ? { id: entry.id, name: entry.name, updatedAt: entry.updatedAt } : merged.get(entry.id)!;
        merged.set(entry.id, { ...shown, sharedBy, everyone });
      }
      return [...merged.values()];
    },

    async delete(id) {
      await local.delete(id);
      newest.delete(id);
      // After any upload still going, so the revision deleted is the one it got back.
      await serially(async () => {
        // The newer of what the list showed and what this browser's own last upload got back.
        const seen = [sync()[id]?.revision, listed.get(id)?.revision].filter((r): r is number => r !== undefined);
        if (!seen.length) return;
        const revision = Math.max(...seen);
        const response = await call(at(id), { method: 'DELETE', headers: { 'If-Match': `"${revision}"` } });
        if (response?.status === 412) throw new ProjectConflictError();
        if (!response?.ok) throw new LibraryLocalOnlyError(LIBRARY_UNREACHABLE);
        listed.delete(id);
        remember(id, undefined);
      });
    },

    async duplicate(id) {
      const remote = await remoteGet(id);
      const mine = remote ? (await local.list()).find(entry => entry.id === id) : undefined;
      const copy = remote && remoteWins(id, { revision: remote.revision, updatedAt: remote.project.updatedAt }, mine)
        ? await local.saveCopy(remote.project, 'Copy')
        : await local.duplicate(id);
      if (copy) await upload(copy).catch(() => {});
      return copy;
    },

    async saveThumbnail(id, dataUrl) {
      await local.saveThumbnail(id, dataUrl);
      // Previews are optional, as in the browser library.
      void call(`${at(id)}/thumbnail`, { method: 'PUT', body: dataUrl });
    },

    async getThumbnail(id) { return (await local.getThumbnail(id)) ?? listed.get(id)?.thumbnail ?? null; },

    async getThumbnails() {
      const thumbnails = await local.getThumbnails();
      for (const [id, entry] of listed) if (entry.thumbnail && !thumbnails[id]) thumbnails[id] = entry.thumbnail;
      return thumbnails;
    },

    // A page going away has no time for the network; the next save uploads the stashed copy.
    stashUnsaved: project => local.stashUnsaved(project),
  };
}

/** PUBLIC_CLOUD_LIBRARY=true at build time (vite.config.ts) adds the online library; otherwise plans stay in the browser. */
export const dataStore: DataStore = import.meta.env.PUBLIC_CLOUD_LIBRARY === 'true' ? createLibraryStore(localStore) : localStore;
