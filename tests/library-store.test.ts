import { mockStorage } from './fixtures/indexeddb';
import { librarySite } from './fixtures/librarySite';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import {
  createLibraryStore, createLocalStore, localStore, LibraryLocalOnlyError, ProjectConflictError,
  LIBRARY_SIGN_IN, LIBRARY_TOO_LARGE, LIBRARY_WAITING, type DataStore,
} from '$lib/services/datastore';
import { createDefaultProject, loadProject } from '$lib/stores/project';
import { autoSave, markClean, saveError, saveState } from '$lib/stores/saveStatus';
import { MAX_PLAN_BYTES } from '../functions/api/library/_shared';
import type { Project } from '$lib/models/types';

let site: ReturnType<typeof librarySite>;
let browser: DataStore;
let device: DataStore;
let remembered: Map<string, string>;
/** Another page of the same browser: a reload, or a second tab. */
const page = (fetch: typeof globalThis.fetch = site.fetch, waitMs?: number) => createLibraryStore(createLocalStore(), {
  fetch, waitMs,
  storage: { getItem: key => remembered.get(key) ?? null, setItem: (key, value) => { remembered.set(key, value); } },
});

beforeEach(() => {
  mockStorage();
  site = librarySite();
  remembered = new Map<string, string>();
  browser = createLocalStore();
  device = createLibraryStore(browser, {
    fetch: site.fetch,
    storage: { getItem: key => remembered.get(key) ?? null, setItem: (key, value) => { remembered.set(key, value); } },
  });
});

const plan = (name: string, updatedAt: string) => {
  const project = createDefaultProject(name);
  project.updatedAt = new Date(updatedAt);
  return project;
};
const at = (id: string) => `/api/library/${encodeURIComponent(id)}`;

async function online(id: string): Promise<{ project: Project; revision: string | null } | null> {
  const response = await site.fetch(at(id));
  return response.status === 404 ? null : { project: await response.json(), revision: response.headers.get('ETag') };
}

/** A save from a second device, straight to the site. */
async function elsewhere(project: Project, revision?: number) {
  const response = await site.fetch(at(project.id), {
    method: 'PUT', body: JSON.stringify(project),
    headers: revision === undefined ? { 'If-None-Match': '*' } : { 'If-Match': `"${revision}"` },
  });
  expect(response.status).toBe(204);
}

describe('online plan library', () => {
  it('saves to the browser first, then the site, one revision per save', async () => {
    const project = plan('Basement', '2026-11-01T10:00:00Z');
    await device.save(project);
    expect((await browser.load(project.id))?.name).toBe('Basement');
    expect(await online(project.id)).toMatchObject({ project: { name: 'Basement' }, revision: '"1"' });
    project.name = 'Basement v2';
    await device.save(project);
    expect(await online(project.id)).toMatchObject({ project: { name: 'Basement v2' }, revision: '"2"' });
  });

  it('lists browser-only and site-only plans together', async () => {
    await browser.save(plan('Only here', '2026-11-01T10:00:00Z'));
    await elsewhere(plan('Only online', '2026-11-02T10:00:00Z'));
    expect((await device.list()).map(p => p.name).sort()).toEqual(['Only here', 'Only online']);
    site.offline = true;
    expect((await device.list()).map(p => p.name)).toEqual(['Only here']);
  });

  it('opens the newer copy: a later save on another device replaces an unchanged browser copy', async () => {
    const project = plan('Mine', '2026-11-01T10:00:00Z');
    await device.save(project);
    await elsewhere({ ...project, name: 'Theirs', updatedAt: new Date('2026-11-02T10:00:00Z') }, 1);
    expect((await device.list()).find(p => p.id === project.id)?.name).toBe('Theirs');
    expect((await device.load(project.id))?.name).toBe('Theirs');
    expect((await browser.load(project.id))?.name).toBe('Theirs');
  });

  it('opens the newer copy: browser edits the site never got win over an older site copy, then upload', async () => {
    const project = plan('Online', '2026-11-01T10:00:00Z');
    await device.save(project);
    site.offline = true;
    project.name = 'Edited offline';
    project.updatedAt = new Date('2026-11-03T10:00:00Z');
    await expect(device.save(project)).rejects.toBeInstanceOf(LibraryLocalOnlyError);
    site.offline = false;
    const opened = await device.load(project.id);
    expect(opened?.name).toBe('Edited offline');
    await vi.waitFor(async () => expect(await online(project.id)).toMatchObject({ project: { name: 'Edited offline' }, revision: '"2"' }));
    await device.save({ ...opened!, name: 'Edited online' });
    expect(await online(project.id)).toMatchObject({ project: { name: 'Edited online' }, revision: '"3"' });
  });

  it('refuses a stale save with ProjectConflictError and keeps both versions after Save as copy', async () => {
    const project = plan('Shared', '2026-11-01T10:00:00Z');
    await device.save(project);
    await elsewhere({ ...project, name: 'Their edit', updatedAt: new Date('2026-11-02T10:00:00Z') }, 1);
    project.name = 'My edit';
    project.updatedAt = new Date('2026-11-03T10:00:00Z');
    await expect(device.save(project)).rejects.toBeInstanceOf(ProjectConflictError);
    expect((await online(project.id))?.project.name).toBe('Their edit');
    expect((await browser.load(project.id))?.name).toBe('My edit');
    const copy = await device.saveCopy(project);
    expect((await online(copy.id))?.project.name).toBe('My edit (Recovered copy)');
    expect((await device.load(project.id))?.name).toBe('Their edit');
  });

  it('keeps a plan over the size limit in the browser and says so', async () => {
    const project = plan('x'.repeat(MAX_PLAN_BYTES), '2026-11-01T10:00:00Z');
    await expect(device.save(project)).rejects.toThrow(LIBRARY_TOO_LARGE);
    expect(await browser.has(project.id)).toBe(true);
    expect(await online(project.id)).toBeNull();
  });

  it('keeps a save made with no signal in the browser, says so, and uploads it on the next save', async () => {
    const project = plan('Offline', '2026-11-01T10:00:00Z');
    site.offline = true;
    await expect(device.save(project)).rejects.toThrow(LIBRARY_WAITING);
    expect(await browser.has(project.id)).toBe(true);
    site.offline = false;
    expect(await online(project.id)).toBeNull();
    await device.save(project);
    expect(await online(project.id)).toMatchObject({ revision: '"1"' });
  });

  it('uploads saves that overlap on a slow network one after another, never as a conflict with itself', async () => {
    const slow = createLibraryStore(browser, {
      fetch: async (input, init) => { await new Promise(resolve => setTimeout(resolve, 20)); return site.fetch(input, init); },
      storage: { getItem: key => remembered.get(key) ?? null, setItem: (key, value) => { remembered.set(key, value); } },
    });
    const remembered = new Map<string, string>();
    const project = plan('Slow', '2026-11-01T10:00:00Z');
    const first = slow.save(project);
    const second = slow.save({ ...project, name: 'Slow v2' });
    const third = slow.save({ ...project, name: 'Slow v3' });
    await Promise.all([first, second, third]);
    expect(await online(project.id)).toMatchObject({ project: { name: 'Slow v3' } });
    await slow.save({ ...project, name: 'Slow v4' });
    expect(await online(project.id)).toMatchObject({ project: { name: 'Slow v4' } });
  });

  it('sends a plan only this browser holds (a restored backup, an imported package) online when the list is shown', async () => {
    const restored = plan('Restored', '2026-11-01T10:00:00Z');
    await browser.save(restored);
    await device.list();
    await vi.waitFor(async () => expect(await online(restored.id)).toMatchObject({ project: { name: 'Restored' }, revision: '"1"' }));
    await device.list();
    await device.save({ ...restored, name: 'Restored v2' });
    expect(await online(restored.id)).toMatchObject({ project: { name: 'Restored v2' }, revision: '"2"' });
  });

  it('sends up plans saved with no signal, with no edit, list or open since', async () => {
    const project = plan('Kept', '2026-11-01T10:00:00Z');
    await device.save(project);
    site.offline = true;
    await expect(device.save({ ...project, name: 'Kept offline' })).rejects.toThrow(LIBRARY_WAITING);
    const fresh = plan('Made offline', '2026-11-01T10:00:00Z');
    await expect(device.save(fresh)).rejects.toThrow(LIBRARY_WAITING);
    device.uploadPending!();
    site.offline = false;
    device.uploadPending!();
    await vi.waitFor(async () => {
      expect(await online(project.id)).toMatchObject({ project: { name: 'Kept offline' }, revision: '"2"' });
      expect(await online(fresh.id)).toMatchObject({ project: { name: 'Made offline' }, revision: '"1"' });
    });
    await device.save({ ...project, name: 'Kept v3' });
    expect(await online(project.id)).toMatchObject({ revision: '"3"' });
  });

  it('sends a change whose tab closed before the upload, from the next page', async () => {
    const project = plan('Closed', '2026-11-01T10:00:00Z');
    await device.save(project);
    // The browser copy changed and the page went away before any request left.
    const closed = createLocalStore();
    await closed.load(project.id);
    await closed.save({ ...project, name: 'Closed mid-save' });
    const next = page();
    next.uploadPending!();
    await vi.waitFor(async () => expect(await online(project.id)).toMatchObject({ project: { name: 'Closed mid-save' }, revision: '"2"' }));
    await next.save({ ...(await next.load(project.id))!, name: 'Closed v3' });
    expect(await online(project.id)).toMatchObject({ revision: '"3"' });
  });

  it('takes an upload whose answer was lost as done, not as a conflict', async () => {
    const project = plan('Lost answer', '2026-11-01T10:00:00Z');
    await device.save(project);
    const lossy = page(async (input, init) => { await site.fetch(input, init); throw new TypeError('Failed to fetch'); });
    await lossy.load(project.id);
    await expect(lossy.save({ ...project, name: 'Got there' })).rejects.toThrow(LIBRARY_WAITING);
    expect(await online(project.id)).toMatchObject({ project: { name: 'Got there' }, revision: '"2"' });
    const next = page();
    await next.save({ ...(await next.load(project.id))!, name: 'And again' });
    expect(await online(project.id)).toMatchObject({ project: { name: 'And again' }, revision: '"3"' });
  });

  it('deletes with no signal in this browser, hides it, and deletes it online once the signal is back', async () => {
    const gone = plan('Gone later', '2026-11-01T10:00:00Z');
    await device.save(gone);
    await device.list();
    site.offline = true;
    await expect(device.delete(gone.id)).rejects.toThrow(LIBRARY_WAITING);
    site.offline = false;
    const next = page(async (input, init) => init?.method === 'DELETE' ? Promise.reject(new TypeError('Failed to fetch')) : site.fetch(input, init));
    expect((await next.list()).map(p => p.id)).not.toContain(gone.id);
    page().uploadPending!();
    await vi.waitFor(async () => expect(await online(gone.id)).toBeNull());
    expect((await page().list()).map(p => p.id)).not.toContain(gone.id);
  });

  it('gives up on a request that hangs, and sends the change later', async () => {
    const project = plan('Hung', '2026-11-01T10:00:00Z');
    const hung = page((_input, init) => new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal!.reason))), 30);
    await expect(hung.save(project)).rejects.toThrow(LIBRARY_WAITING);
    page().uploadPending!();
    await vi.waitFor(async () => expect(await online(project.id)).toMatchObject({ revision: '"1"' }));
  });

  it('says the sign-in ran out when the library answers with a sign-in page, and sends the change after', async () => {
    const project = plan('Signed out', '2026-11-01T10:00:00Z');
    const signedOut = page(async () => new Response('<html>Sign in</html>', { status: 401 }));
    await expect(signedOut.save(project)).rejects.toThrow(LIBRARY_SIGN_IN);
    const loginPage = page(async () => new Response('<html>Sign in</html>', { status: 200 }));
    expect((await loginPage.load(project.id))?.name).toBe('Signed out');
    await expect(loginPage.save(project)).rejects.toThrow(LIBRARY_WAITING);
    expect(await loginPage.list()).toHaveLength(1);
    page().uploadPending!();
    await vi.waitFor(async () => expect(await online(project.id)).toMatchObject({ revision: '"1"' }));
  });

  it('sends a refused copy again only once it changes', async () => {
    const big = plan('x'.repeat(MAX_PLAN_BYTES), '2026-11-01T10:00:00Z');
    let puts = 0;
    const counting = page(async (input, init) => { if (init?.method === 'PUT') puts++; return site.fetch(input, init); });
    await expect(counting.save(big)).rejects.toThrow(LIBRARY_TOO_LARGE);
    counting.uploadPending!();
    await counting.list();
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(puts).toBe(1);
    await counting.save({ ...big, name: 'Small now' });
    expect(await online(big.id)).toMatchObject({ project: { name: 'Small now' }, revision: '"1"' });
  });

  it('reads the marks from before fingerprints: pending goes up, the rest counts as online until it changes', async () => {
    const kept = plan('Kept', '2026-11-01T10:00:00Z'), waiting = plan('Waiting', '2026-11-01T10:00:00Z');
    await device.save(kept);
    await device.save(waiting);
    await browser.save({ ...waiting, name: 'Waiting offline' });
    remembered.set('o3d_library_sync', JSON.stringify({ [kept.id]: { revision: 1 }, [waiting.id]: { revision: 1, pending: true } }));
    let puts = 0;
    const next = page(async (input, init) => { if (init?.method === 'PUT') puts++; return site.fetch(input, init); });
    next.uploadPending!();
    await vi.waitFor(async () => expect(await online(waiting.id)).toMatchObject({ project: { name: 'Waiting offline' }, revision: '"2"' }));
    expect(puts).toBe(1);
    await next.save({ ...(await next.load(kept.id))!, name: 'Kept v2' });
    expect(await online(kept.id)).toMatchObject({ project: { name: 'Kept v2' }, revision: '"2"' });
  });

  it('deletes from both, and refuses to delete a revision it has not seen', async () => {
    const gone = plan('Gone', '2026-11-01T10:00:00Z'), kept = plan('Kept', '2026-11-01T10:00:00Z');
    await device.save(gone);
    await device.save(kept);
    await device.list();
    await device.delete(gone.id);
    expect(await online(gone.id)).toBeNull();
    expect(await browser.has(gone.id)).toBe(false);
    await elsewhere({ ...kept, name: 'Changed elsewhere' }, 1);
    await expect(device.delete(kept.id)).rejects.toBeInstanceOf(ProjectConflictError);
    expect((await online(kept.id))?.project.name).toBe('Changed elsewhere');
  });

  it('the editor counts a browser-only save as saved and shows why it is not online', async () => {
    const project = plan('Editor', '2026-11-01T10:00:00Z');
    loadProject(project);
    markClean();
    vi.spyOn(localStore, 'save').mockRejectedValueOnce(new LibraryLocalOnlyError(LIBRARY_WAITING));
    expect(await autoSave()).toBe(true);
    expect(get(saveState)).toBe('saved');
    expect(get(saveError)).toBe(LIBRARY_WAITING);
  });
});

describe('library functions', () => {
  it('require a revision precondition and the plan named in the address', async () => {
    const project = plan('Rules', '2026-11-01T10:00:00Z');
    expect((await site.fetch(at(project.id), { method: 'PUT', body: JSON.stringify(project) })).status).toBe(428);
    expect((await site.fetch(at('other-id'), { method: 'PUT', headers: { 'If-None-Match': '*' }, body: JSON.stringify(project) })).status).toBe(400);
    await elsewhere(project);
    expect((await site.fetch(at(project.id), { method: 'PUT', headers: { 'If-None-Match': '*' }, body: JSON.stringify(project) })).status).toBe(412);
    expect((await site.fetch(at(project.id), { method: 'DELETE' })).status).toBe(428);
  });
});
