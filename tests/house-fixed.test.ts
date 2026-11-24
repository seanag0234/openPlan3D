import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { get } from 'svelte/store';
import { readProject } from '$lib/utils/projectValidation';
import { currentProject, houseFixed, loadProject, redo, setHouseFixed, undo, undoHistoryStore } from '$lib/stores/project';
import { undoMessage } from '$lib/i18n/undoMessages';
import { roomProject } from './fixtures/project';

const saved = () => JSON.parse(readFileSync(new URL('./fixtures/native-import.openplan.json', import.meta.url), 'utf8'));

describe('a plan whose house is fixed', () => {
  it('keeps the flag when it is read', () => {
    const plan = { ...saved(), houseFixed: true };
    const loaded = readProject(plan);
    expect(loaded.houseFixed).toBe(true);
    expect(loaded).toEqual({ ...readProject(saved()), houseFixed: true });
  });

  it('refuses a flag that is not true or false', () => {
    expect(() => readProject({ ...saved(), houseFixed: 'yes' })).toThrow('Invalid project: document.houseFixed must be a boolean.');
  });

  it('reads a plan saved without the flag as before, with no flag added', () => {
    const loaded = readProject(saved());
    expect('houseFixed' in loaded).toBe(false);
    expect(readProject(JSON.parse(JSON.stringify(loaded)))).toEqual(loaded);
  });

  it('is set in one history step that Undo takes back', () => {
    loadProject(roomProject());
    expect(get(houseFixed)).toBe(false);
    setHouseFixed(false);
    expect(get(undoHistoryStore).entries).toHaveLength(0);
    setHouseFixed(true);
    expect(get(houseFixed)).toBe(true);
    expect(get(currentProject)!.houseFixed).toBe(true);
    expect(get(undoHistoryStore).entries.map(entry => entry.description)).toEqual(['Fixed the house']);
    setHouseFixed(true);
    expect(get(undoHistoryStore).entries).toHaveLength(1);
    undo();
    expect(get(houseFixed)).toBe(false);
    expect('houseFixed' in get(currentProject)!).toBe(false);
    redo();
    expect(get(houseFixed)).toBe(true);
    setHouseFixed(false);
    expect('houseFixed' in get(currentProject)!).toBe(false);
    expect(get(undoHistoryStore).entries.at(-1)!.description).toBe('Let the house move');
  });

  it('names both history steps in Portuguese', () => {
    expect(undoMessage('Fixed the house', 'pt')).toBe('Casa fixada');
    expect(undoMessage('Let the house move', 'pt')).toBe('Casa liberada para mover');
    expect(undoMessage('Fixed the house', 'en')).toBe('Fixed the house');
  });
});
