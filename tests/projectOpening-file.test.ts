import './fixtures/indexeddb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { openPlanFile, readPlanFile } from '$lib/services/projectOpening';
import { localStore } from '$lib/services/datastore';
import { LibraryBackupFileError } from '$lib/services/libraryRestore';
import { currentProject, loadProject } from '$lib/stores/project';
import { initAutoSave, markClean, saveState } from '$lib/stores/saveStatus';
import { importQuestion, type ImportAnswer } from '$lib/stores/ui';
import { getSnapshots, saveSnapshot } from '$lib/stores/versionHistory';
import { roomProject } from './fixtures/project';

let stop: () => void;
let asked: string[] = [];
let answer: ImportAnswer = 'cancel';
let unsubscribe: () => void;

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
  asked = [];
  ID = `made-up-flat-${Math.random().toString(16).slice(2)}`;
  plan = JSON.stringify({ ...roomProject(), id: ID });
  unsubscribe = importQuestion.subscribe(question => {
    if (!question) return;
    asked.push(question.name);
    question.resolve(answer);
  });
});
afterEach(() => { unsubscribe(); stop(); markClean(); vi.useRealTimers(); });

const names = async () => (await localStore.list()).map(p => p.name).sort();

it('opens a plan the list does not hold, keeping its id and name', async () => {
  const opened = await openPlanFile(() => planFile());
  expect(opened).toMatchObject({ id: ID, name: 'Made-up flat' });
  expect(get(currentProject)?.id).toBe(ID);
  expect(await localStore.has(ID)).toBe(true);
  expect(asked).toEqual([]);
});

it('opens the stored plan when the file holds the same content, without a question or a second plan', async () => {
  await openPlanFile(() => planFile());
  const count = (await localStore.list()).length;
  const file = planFile();
  file.updatedAt = new Date(2030, 0, 1).toISOString();
  file.createdAt = new Date(2001, 0, 1).toISOString();
  loadProject(roomProject()); markClean();
  const opened = await openPlanFile(() => file);
  expect(opened?.id).toBe(ID);
  expect(get(currentProject)?.id).toBe(ID);
  expect((await localStore.list()).length).toBe(count);
  expect(asked).toEqual([]);
});

it('asks when the content differs; Keep both numbers the new one (2), then (3)', async () => {
  await openPlanFile(() => planFile());
  const changed = () => { const file = planFile(); file.floors[0].walls[0].height = 123; return file; };
  answer = 'copy';
  const second = await openPlanFile(() => changed());
  expect(asked).toEqual(['Made-up flat']);
  expect(second?.id).not.toBe(ID);
  expect(second?.name).toBe('Made-up flat (2)');
  const third = await openPlanFile(() => changed());
  expect(third?.name).toBe('Made-up flat (3)');
  expect(await names()).toEqual(expect.arrayContaining(['Made-up flat', 'Made-up flat (2)', 'Made-up flat (3)']));
  expect((await localStore.load(ID))!.floors[0].walls[0].height).not.toBe(123);
});

it('Keep both on a file already numbered takes the next free number from its base name', async () => {
  await openPlanFile(() => planFile());
  answer = 'copy';
  const changed = planFile('Made-up flat (2)'); changed.floors[0].walls[0].height = 99;
  const stored = await localStore.load(ID);
  stored!.name = 'Made-up flat (2)'; await localStore.save(stored!);
  const copy = await openPlanFile(() => changed);
  expect(copy?.name).toBe('Made-up flat (3)');
});

it('Replace keeps the id, stores the file and keeps the plan it replaced as a version', async () => {
  await openPlanFile(() => planFile());
  const before = (await localStore.load(ID))!;
  const count = (await localStore.list()).length;
  answer = 'replace';
  const file = planFile(); file.floors[0].walls[0].height = 321;
  const opened = await openPlanFile(() => file);
  expect(opened?.id).toBe(ID);
  expect(get(currentProject)?.id).toBe(ID);
  expect(get(saveState)).toBe('saved');
  expect((await localStore.load(ID))!.floors[0].walls[0].height).toBe(321);
  expect((await localStore.list()).length).toBe(count);
  const versions = await getSnapshots(ID);
  const kept = versions.find(v => v.description === 'Before replacing with a file');
  expect(kept).toBeTruthy();
  expect(JSON.parse(kept!.data).floors[0].walls[0].height).toBe(before.floors[0].walls[0].height);
});

it('Replace names the version it keeps, even when the newest version already holds that plan', async () => {
  await openPlanFile(() => planFile());
  const stored = (await localStore.load(ID))!;
  await saveSnapshot(stored, 'Session start');
  answer = 'replace';
  const file = planFile(); file.floors[0].walls[0].height = 222;
  await openPlanFile(() => file);
  const versions = await getSnapshots(ID);
  const last = versions.at(-1)!;
  expect(last.description).toBe('Before replacing with a file');
  expect(JSON.parse(last.data)).toEqual(JSON.parse(JSON.stringify(stored)));
});

it('Cancel changes nothing', async () => {
  await openPlanFile(() => planFile());
  const previous = roomProject(); loadProject(previous); markClean(); await localStore.save(previous);
  const before = JSON.stringify(await localStore.list());
  const stored = await localStore.load(ID);
  answer = 'cancel';
  const file = planFile(); file.floors[0].walls[0].height = 7;
  expect(await openPlanFile(() => file)).toBeNull();
  expect(get(currentProject)).toBe(previous);
  expect(JSON.stringify(await localStore.list())).toBe(before);
  expect(await localStore.load(ID)).toEqual(stored);
  expect(get(importQuestion)).toBeNull();
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
