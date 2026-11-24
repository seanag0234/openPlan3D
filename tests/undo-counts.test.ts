import { expect, it } from 'vitest';
import { get } from 'svelte/store';
import { addWall, createDefaultProject, loadProject, redo, undo, undoHistoryStore } from '$lib/stores/project';

// The top bar shows Undo and Redo as switched off from these counts.
const counts = () => { const h = get(undoHistoryStore); return { undo: h.entries.length, redo: h.redoCount }; };

it('says how many steps Undo and Redo each have', () => {
  loadProject(createDefaultProject('Counting steps'));
  expect(counts()).toEqual({ undo: 0, redo: 0 });

  addWall({ x: 0, y: 0 }, { x: 300, y: 0 });
  expect(counts()).toEqual({ undo: 1, redo: 0 });

  undo();
  expect(counts()).toEqual({ undo: 0, redo: 1 });

  redo();
  expect(counts()).toEqual({ undo: 1, redo: 0 });

  undo();
  addWall({ x: 0, y: 100 }, { x: 300, y: 100 });
  expect(counts()).toEqual({ undo: 1, redo: 0 });
});

it('an Undo or Redo with nothing left changes no count', () => {
  loadProject(createDefaultProject('Nothing to step to'));
  undo(); redo();
  expect(counts()).toEqual({ undo: 0, redo: 0 });
});
