import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { mockStorage } from './fixtures/indexeddb';

const storage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

beforeEach(() => {
  vi.resetModules();
  // The store only touches storage in the browser.
  vi.stubGlobal('window', {});
});

afterEach(() => {
  if (storage) Object.defineProperty(globalThis, 'localStorage', storage);
  else Reflect.deleteProperty(globalThis, 'localStorage');
});

/** Blocked site data: reading localStorage itself throws, as browsers do when cookies are blocked. */
function blockStorage() {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() { throw new DOMException('Access is denied for this document.', 'SecurityError'); },
  });
}

const load = async () => (await import('../src/lib/stores/settings')).projectSettings;

/** What S and the status-bar Snap button do. */
function switchSnapStep(settings: Awaited<ReturnType<typeof load>>) {
  settings.update((s) => ({ ...s, snapToGrid: !s.snapToGrid }));
}

describe('editor settings', () => {
  it('switches the snap step for the session when site storage is blocked', async () => {
    blockStorage();
    const settings = await load();
    expect(get(settings).snapToGrid).toBe(true);
    expect(() => switchSnapStep(settings)).not.toThrow();
    expect(get(settings).snapToGrid).toBe(false);
    switchSnapStep(settings);
    expect(get(settings).snapToGrid).toBe(true);
  });

  it('applies Settings changes for the session when site storage is blocked', async () => {
    blockStorage();
    const settings = await load();
    expect(() => settings.set({ ...get(settings), units: 'imperial', showInternalDimensions: true })).not.toThrow();
    expect(get(settings)).toMatchObject({ units: 'imperial', showInternalDimensions: true });
    expect(() => settings.reset()).not.toThrow();
    expect(get(settings)).toMatchObject({ units: 'metric', showInternalDimensions: false });
  });

  it('keeps changes that full storage could not save', async () => {
    const data = mockStorage();
    vi.mocked(localStorage.setItem).mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError'); });
    const settings = await load();
    expect(() => switchSnapStep(settings)).not.toThrow();
    expect(() => settings.set({ ...get(settings), units: 'imperial' })).not.toThrow();
    expect(get(settings)).toMatchObject({ snapToGrid: false, units: 'imperial' });
    expect(data.has('o3d_settings')).toBe(false);
  });

  it('applies a plan file\'s display settings as if picked in Settings, ignoring unknown and other keys', async () => {
    const data = mockStorage();
    const { projectSettings, applyDisplaySettings } = await import('../src/lib/stores/settings');
    applyDisplaySettings({ units: 'imperial', showDimensions: false, showObjectSizes: false, gridSize: 5, future: true } as any);
    expect(get(projectSettings)).toMatchObject({ units: 'imperial', showDimensions: false, showExternalDimensions: true, showObjectSizes: false, gridSize: 25 });
    expect(get(projectSettings)).not.toHaveProperty('future');
    expect(JSON.parse(data.get('o3d_settings')!)).toMatchObject({ units: 'imperial', showDimensions: false });
  });

  it('writes the browser\'s display settings into a downloaded plan and keeps the file\'s unknown keys', async () => {
    mockStorage();
    const { projectSettings, withDisplaySettings } = await import('../src/lib/stores/settings');
    projectSettings.set({ ...get(projectSettings), units: 'imperial', showInternalDimensions: true });
    const project = { id: 'plan', displaySettings: { units: 'metric', future: 'kept' } } as any;
    expect(withDisplaySettings(project, get(projectSettings)).displaySettings).toEqual({
      units: 'imperial', showDimensions: true, showExternalDimensions: true, showInternalDimensions: true, showObjectSizes: true, future: 'kept',
    });
    expect(project.displaySettings).toEqual({ units: 'metric', future: 'kept' });
  });

  it('shows object sizes by default', async () => {
    expect(get(await load()).showObjectSizes).toBe(true);
  });

  it('remembers changes across reloads when storage works', async () => {
    const data = mockStorage();
    const settings = await load();
    switchSnapStep(settings);
    expect(JSON.parse(data.get('o3d_settings')!)).toMatchObject({ snapToGrid: false });
    settings.set({ ...get(settings), units: 'imperial' });
    vi.resetModules();
    expect(get(await load())).toMatchObject({ snapToGrid: false, units: 'imperial' });
  });

  it('starts a fresh store at the one list of defaults', async () => {
    mockStorage();
    const { projectSettings, DEFAULT_SETTINGS } = await import('../src/lib/stores/settings');
    expect(get(projectSettings)).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS).toMatchObject({ units: 'metric', snapToGrid: true, gridSize: 25, showObjectSizes: true });
  });
});
