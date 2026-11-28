import './fixtures/indexeddb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { openPlanFile, readPlanFile } from '$lib/services/projectOpening';
import { localStore } from '$lib/services/datastore';
import { LibraryBackupFileError } from '$lib/services/libraryRestore';
import { currentProject, loadProject } from '$lib/stores/project';
import { initAutoSave, markClean, saveState } from '$lib/stores/saveStatus';
import { roomProject } from './fixtures/project';

let stop: () => void;

// Each test has a fresh database, but the store remembers which plans this tab opened: a new id per test.
let ID = '';
let plan = '';
/** A made-up plan as a file would hold it: plain JSON, dates as text. The same plan each time within a test. */
function planFile(name = 'Made-up flat') {
  return { ...JSON.parse(plan), name };
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  // Something else is open first, as in the editor.
  loadProject(roomProject());
  markClean();
  await localStore.save(get(currentProject)!);
  stop = initAutoSave();
  ID = `made-up-flat-${Math.random().toString(16).slice(2)}`;
  plan = JSON.stringify({ ...roomProject(), id: ID });
});
afterEach(() => { stop(); markClean(); vi.useRealTimers(); });

const names = async () => (await localStore.list()).map(p => p.name).sort();

it('opens a file as a new plan with an id of its own, keeping a name the list does not hold', async () => {
  const opened = await openPlanFile(() => planFile());
  expect(opened?.id).not.toBe(ID);
  expect(opened?.name).toBe('Made-up flat');
  expect(get(currentProject)?.id).toBe(opened?.id);
  expect(get(saveState)).toBe('saved');
  expect(await localStore.has(opened!.id)).toBe(true);
});

it('opens the same file again as another new plan, numbered (2) then (3), leaving the first as it was', async () => {
  const first = (await openPlanFile(() => planFile()))!;
  const stored = await localStore.load(first.id);
  const file = planFile();
  file.updatedAt = new Date(2030, 0, 1).toISOString();
  loadProject(roomProject()); markClean();
  const second = await openPlanFile(() => file);
  expect(second?.id).not.toBe(first.id);
  expect(second?.name).toBe('Made-up flat (2)');
  const third = await openPlanFile(() => planFile());
  expect(third?.name).toBe('Made-up flat (3)');
  expect(new Set([first.id, second!.id, third!.id]).size).toBe(3);
  expect(await names()).toEqual(expect.arrayContaining(['Made-up flat', 'Made-up flat (2)', 'Made-up flat (3)']));
  expect(await localStore.load(first.id)).toEqual(stored);
});

it('a file already numbered takes the next free number from its base name', async () => {
  await openPlanFile(() => planFile());
  await openPlanFile(() => planFile());
  const copy = await openPlanFile(() => planFile('Made-up flat (2)'));
  expect(copy?.name).toBe('Made-up flat (3)');
});

it('reads a chosen file, and refuses a backup of every plan', async () => {
  const text = JSON.stringify(planFile());
  expect(await readPlanFile(new File([text], 'flat.json'))).toMatchObject({ id: ID });
  await expect(readPlanFile(new File(['{"hello":'], 'broken.json'))).rejects.toThrow();
  const backup = { format: 'openplan3d-library', projects: {} };
  await expect(readPlanFile(new File([JSON.stringify(backup)], 'all.json'))).rejects.toBeInstanceOf(LibraryBackupFileError);
});

it('a plan file cut short is said to be no plan, whatever the browser calls it', async () => {
  await expect(readPlanFile(new File(['{"id":"a","name":"Ro'], 'half.json'))).rejects.toThrow(/^Invalid project:/);
});
