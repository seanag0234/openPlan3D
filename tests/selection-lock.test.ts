import { expect, it } from 'vitest';
import { get } from 'svelte/store';
import { createDefaultProject, loadProject, currentProject, toggleSelectionLock, undo, redo, removeElement, removeTextAnnotation, beginUndoGroup, endUndoGroup, undoHistoryStore } from '$lib/stores/project';

function lockedPlan() {
  const project = createDefaultProject(), floor = project.floors[0];
  floor.furniture = [{ id: 'f', catalogId: 'sofa', position: { x: 0, y: 0 }, rotation: 0, scale: { x: 1, y: 1, z: 1 }, locked: true },
    { id: 'free', catalogId: 'sofa', position: { x: 300, y: 0 }, rotation: 0, scale: { x: 1, y: 1, z: 1 } }];
  floor.entourage = [{ id: 'e', defId: 'person', position: { x: 100, y: 0 }, rotation: 0, width: 50, locked: true }];
  floor.textAnnotations = [{ id: 't', x: 0, y: 100, text: 'PARK', fontSize: 16, color: '#111', rotation: 0, locked: true }];
  floor.groups = [{ id: 'g', elementIds: ['f', 'e'] }];
  loadProject(project);
}

it('leaves locked pieces, symbols and text labels in place when they are deleted', () => {
  lockedPlan(); const before = structuredClone(get(currentProject)!.floors[0]);
  for (const id of ['f', 'e']) removeElement(id);
  removeTextAnnotation('t');
  expect(get(currentProject)!.floors[0]).toEqual(before);
  expect(get(undoHistoryStore).entries).toEqual([]);
});

it('deletes the unlocked items of a mixed selection and keeps the locked ones, in one undo', () => {
  lockedPlan(); const before = structuredClone(get(currentProject)!.floors[0]);
  beginUndoGroup(); for (const id of ['f', 'e', 't', 'free']) removeElement(id); endUndoGroup();
  const floor = get(currentProject)!.floors[0];
  expect(floor.furniture.map(item => item.id)).toEqual(['f']);
  expect(floor.entourage!.map(item => item.id)).toEqual(['e']);
  expect(floor.textAnnotations!.map(item => item.id)).toEqual(['t']);
  expect(floor.groups).toEqual(before.groups);
  undo(); expect(get(currentProject)!.floors[0]).toEqual(before);
});

it('locks and unlocks text labels with the rest of the selection', () => {
  lockedPlan();
  toggleSelectionLock(new Set(['t', 'free']));
  expect(get(currentProject)!.floors[0].textAnnotations![0].locked).toBe(true);
  expect(get(currentProject)!.floors[0].furniture[1].locked).toBe(true);
  toggleSelectionLock(new Set(['t', 'free']));
  expect(get(currentProject)!.floors[0].textAnnotations![0].locked).toBe(false);
  undo(); expect(get(currentProject)!.floors[0].textAnnotations![0].locked).toBe(true);
});

it('locks mixed furniture/entourage together and restores all flags with one undo', () => {
  const project=createDefaultProject(),floor=project.floors[0];
  floor.furniture=[{id:'f',catalogId:'sofa',position:{x:0,y:0},rotation:0,scale:{x:1,y:1,z:1},locked:true}];
  floor.entourage=[{id:'e',defId:'person',position:{x:100,y:0},rotation:0,width:50},
    {id:'unselected',defId:'person',position:{x:200,y:0},rotation:0,width:50}];
  loadProject(project); const before=structuredClone(get(currentProject)!.floors[0]);
  toggleSelectionLock(new Set(['f','e']));
  expect(get(currentProject)!.floors[0].furniture[0].locked).toBe(true);
  expect(get(currentProject)!.floors[0].entourage![0].locked).toBe(true);
  expect(get(currentProject)!.floors[0].entourage![1].locked).toBeUndefined();
  toggleSelectionLock(new Set(['missing']));
  undo();expect(get(currentProject)!.floors[0]).toEqual(before);
  redo();
  toggleSelectionLock(new Set(['f','e']));
  expect(get(currentProject)!.floors[0].furniture[0].locked).toBe(false);
  expect(get(currentProject)!.floors[0].entourage![0].locked).toBe(false);
  undo();expect(get(currentProject)!.floors[0].entourage![0].locked).toBe(true);
});
