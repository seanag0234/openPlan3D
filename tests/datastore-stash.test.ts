import { failWrites, mockStorage, putRaw, rawRecords } from './fixtures/indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createLocalStore } from '$lib/services/datastore';
import { createDefaultProject } from '$lib/stores/project';
import { roomProject } from './fixtures/project';

let data: Map<string, string>;
const copyKey = (id: string) => `o3d_unsaved:${id}`;

beforeEach(() => { data = mockStorage(); });

describe('the copy a page leaves when it goes away before its save', () => {
  it('is picked up by the next load of the plan and becomes the stored plan', async () => {
    const tab = createLocalStore();
    const plan = roomProject();
    await tab.save(plan);
    plan.name = 'Renamed in the last second';
    tab.stashUnsaved(plan);
    expect(data.has(copyKey(plan.id))).toBe(true);

    const reloaded = createLocalStore();
    const loaded = await reloaded.load(plan.id);
    expect(loaded?.name).toBe('Renamed in the last second');
    expect(JSON.parse((await rawRecords())[plan.id]).name).toBe('Renamed in the last second');
    expect(data.has(copyKey(plan.id))).toBe(false);
    // The tab that loaded it can save on top of it.
    loaded!.name = 'Then renamed again';
    await reloaded.save(loaded!);
    expect(JSON.parse((await rawRecords())[plan.id]).name).toBe('Then renamed again');
  });

  it('is dropped when another save landed after it', async () => {
    const tab = createLocalStore();
    const plan = roomProject();
    await tab.save(plan);
    plan.name = 'Stale change';
    tab.stashUnsaved(plan);
    // Another tab, or an older copy of the editor, saved the plan after the copy was left.
    await putRaw('projects', plan.id, JSON.stringify({ ...plan, name: 'Saved by another tab' }));

    const loaded = await createLocalStore().load(plan.id);
    expect(loaded?.name).toBe('Saved by another tab');
    expect(JSON.parse((await rawRecords())[plan.id]).name).toBe('Saved by another tab');
    expect(data.has(copyKey(plan.id))).toBe(false);
  });

  it('is dropped when it is not a valid plan', async () => {
    const tab = createLocalStore();
    const plan = roomProject();
    await tab.save(plan);
    const stored = (await rawRecords())[plan.id];
    const stamp = JSON.parse((() => { tab.stashUnsaved({ ...plan, name: 'x' }); return data.get(copyKey(plan.id))!; })()).base;
    data.set(copyKey(plan.id), JSON.stringify({ base: stamp, raw: '{"not":"a plan"}' }));

    const loaded = await createLocalStore().load(plan.id);
    expect(loaded?.name).toBe(plan.name);
    expect((await rawRecords())[plan.id]).toBe(stored);
    expect(data.has(copyKey(plan.id))).toBe(false);
  });

  it('is not written for a plan this tab never opened or saved', () => {
    createLocalStore().stashUnsaved(createDefaultProject('Never saved'));
    expect([...data.keys()].some(key => key.startsWith('o3d_unsaved:'))).toBe(false);
  });

  it('is removed by a save and by a delete', async () => {
    const tab = createLocalStore();
    const plan = roomProject();
    await tab.save(plan);
    tab.stashUnsaved({ ...plan, name: 'Pending' });
    await tab.save({ ...plan, name: 'Saved after all' });
    expect(data.has(copyKey(plan.id))).toBe(false);
    tab.stashUnsaved({ ...plan, name: 'Pending again' });
    await tab.delete(plan.id);
    expect(data.has(copyKey(plan.id))).toBe(false);
  });

  it('leaves a plan saved by the current build opening unchanged', async () => {
    const tab = createLocalStore();
    const plan = roomProject();
    await tab.save(plan);
    const raw = (await rawRecords())[plan.id];
    expect(await createLocalStore().load(plan.id)).toEqual(plan);
    expect((await rawRecords())[plan.id]).toBe(raw);
  });

  it('keeps the copy for the next load when writing it fails, and opens the stored plan', async () => {
    const tab = createLocalStore();
    const plan = roomProject();
    await tab.save(plan);
    tab.stashUnsaved({ ...plan, name: 'Kept for later' });
    const restore = failWrites();
    const loaded = await createLocalStore().load(plan.id);
    restore();
    expect(loaded?.name).toBe(plan.name);
    expect(data.has(copyKey(plan.id))).toBe(true);
    expect((await createLocalStore().load(plan.id))?.name).toBe('Kept for later');
  });

  it('ignores a missing or full localStorage', async () => {
    const tab = createLocalStore();
    const plan = roomProject();
    await tab.save(plan);
    vi.stubGlobal('localStorage', undefined);
    expect(() => tab.stashUnsaved({ ...plan, name: 'Nowhere to go' })).not.toThrow();
    const full = mockStorage(data);
    vi.mocked(localStorage.setItem).mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError'); });
    expect(() => tab.stashUnsaved({ ...plan, name: 'No room' })).not.toThrow();
    expect(full.has(copyKey(plan.id))).toBe(false);
    expect((await createLocalStore().load(plan.id))?.name).toBe(plan.name);
  });
});
