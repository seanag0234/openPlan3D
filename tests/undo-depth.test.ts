import { expect, it } from 'vitest';
import { get } from 'svelte/store';
import { addWall, currentProject, loadProject, redo, undo, undoHistoryStore } from '$lib/stores/project';
import { roomProject } from './fixtures/project';

it('keeps fifty Undo steps on a plan that carries a large picture', () => {
  const project = roomProject();
  const picture = 'data:image/png;base64,' + 'A'.repeat(1_500_000);
  project.floors[0].backgroundImage = { dataUrl: picture, position: { x: 0, y: 0 }, scale: 1, opacity: 0.5, rotation: 0, locked: false };
  loadProject(project);
  const walls = () => get(currentProject)!.floors[0].walls.length;
  const start = walls();

  for (let i = 0; i < 50; i++) addWall({ x: i * 10, y: 500 }, { x: i * 10 + 5, y: 600 });
  expect(walls()).toBe(start + 50);
  expect(get(undoHistoryStore).entries).toHaveLength(50);

  for (let i = 0; i < 50; i++) undo();
  expect(walls()).toBe(start);
  expect(get(currentProject)!.floors[0].backgroundImage?.dataUrl).toBe(picture);

  redo();
  expect(walls()).toBe(start + 1);
  expect(get(currentProject)!.floors[0].backgroundImage?.dataUrl).toBe(picture);
});
