import { mockStorage } from './fixtures/indexeddb';
import { librarySite } from './fixtures/librarySite';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import {
  createLibraryStore, createLocalStore, localStore, LibraryLocalOnlyError, ProjectConflictError,
  LIBRARY_TOO_LARGE, LIBRARY_UNREACHABLE, type DataStore,
} from '$lib/services/datastore';
import { createDefaultProject, loadProject } from '$lib/stores/project';
import { autoSave, markClean, saveError, saveState } from '$lib/stores/saveStatus';
import { MAX_PLAN_BYTES } from '../functions/api/library/_shared';
import type { Project } from '$lib/models/types';

let site: ReturnType<typeof librarySite>;
let browser: DataStore;
let device: DataStore;

beforeEach(() => {
  mockStorage();
  site = librarySite();
  const remembered = new Map<string, string>();
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
    await device.save(opened!);
    expect(await online(project.id)).toMatchObject({ project: { name: 'Edited offline' }, revision: '"2"' });
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
    await expect(device.save(project)).rejects.toThrow(LIBRARY_UNREACHABLE);
    expect(await browser.has(project.id)).toBe(true);
    site.offline = false;
    expect(await online(project.id)).toBeNull();
    await device.save(project);
    expect(await online(project.id)).toMatchObject({ revision: '"1"' });
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
    vi.spyOn(localStore, 'save').mockRejectedValueOnce(new LibraryLocalOnlyError(LIBRARY_UNREACHABLE));
    expect(await autoSave()).toBe(true);
    expect(get(saveState)).toBe('saved');
    expect(get(saveError)).toBe(LIBRARY_UNREACHABLE);
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
