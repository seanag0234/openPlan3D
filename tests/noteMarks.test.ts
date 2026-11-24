import { afterEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { noteMarkAt, noteMarkList } from '$lib/utils/noteMarks';
import type { CanvasState } from '$lib/utils/canvasInteraction';
import { selectedElementId } from '$lib/stores/project';
import type { FurnitureItem, Project } from '$lib/models/types';
import { roomProject } from './fixtures/project';

const cs = (coarse = false) => ({ ctx: null as any, width: 800, height: 600, zoom: 1, camX: 0, camY: 0, coarse }) as CanvasState;

function notedBox(rotation = 0): Project {
  const project = roomProject();
  const box: FurnitureItem = {
    id: 'box', name: 'Made-up box', catalogId: 'imported_object', position: { x: 100, y: 50 }, rotation,
    scale: { x: 1, y: 1, z: 1 }, width: 120, depth: 90, details: { note: 'check this size' },
  } as FurnitureItem;
  project.floors[0].furniture = [box, { ...box, id: 'plain', details: undefined, position: { x: 300, y: 200 } }];
  return project;
}
const marks = (project: Project, state = cs()) => noteMarkList(state, project, project.floors[0], [], get(selectedElementId));

afterEach(() => selectedElementId.set(null));

describe('note marks on the plan', () => {
  it('puts one mark just off the top-right corner of a noted piece', () => {
    const project = notedBox();
    // Corner (160, 5) on a 800 x 600 canvas centred on 0,0 is (560, 305); the mark sits 6 px right and 6 px up.
    expect(marks(project)).toEqual([{ target: { floorId: project.floors[0].id, kind: 'furniture', id: 'box' }, x: 566, y: 299 }]);
  });

  it('follows the corner when the piece is turned', () => {
    const [mark] = marks(notedBox(90));
    // Turned 90°, the corner (60, -45) lands at (45, 60) from the centre: world (145, 110).
    expect(mark.x).toBeCloseTo(551, 6);
    expect(mark.y).toBeCloseTo(404, 6);
  });

  it('marks a noted wall beside its middle and leaves the selected thing alone', () => {
    const project = notedBox();
    project.floors[0].walls[0].details = { note: 'damp here' };
    const wallMark = marks(project).find(mark => mark.target.kind === 'walls')!;
    // The top wall runs from (0, 0) to (400, 0); its middle is (600, 300) on screen.
    expect(Math.hypot(wallMark.x - 600, wallMark.y - 300)).toBeCloseTo(10, 6);
    selectedElementId.set('box');
    expect(marks(project).map(mark => mark.target.id)).toEqual([project.floors[0].walls[0].id]);
  });

  it('marks a noted room above the middle of its corners', () => {
    const project = roomProject();
    const floor = project.floors[0];
    const room = { id: 'room-1', name: 'Made-up room', walls: floor.walls.map(w => w.id), floorTexture: 'none', area: 12, details: { note: 'paint' } };
    floor.rooms = [room];
    const [mark] = noteMarkList(cs(), project, floor, [room], null);
    expect(mark).toEqual({ target: { floorId: floor.id, kind: 'rooms', id: 'room-1' }, x: 600, y: 434 });
  });

  it('reaches further for a finger than for a mouse', () => {
    const project = notedBox();
    const floor = project.floors[0];
    expect(noteMarkAt({ x: 586, y: 299 }, cs(true), project, floor, [])).toEqual({ floorId: floor.id, kind: 'furniture', id: 'box' });
    expect(noteMarkAt({ x: 586, y: 299 }, cs(false), project, floor, [])).toBeNull();
  });
});
