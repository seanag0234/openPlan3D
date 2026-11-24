import { describe, expect, it } from 'vitest';
import { fitIds } from '$lib/utils/fitBounds';
import type { Floor, FurnitureItem } from '$lib/models/types';
import { roomProject } from './fixtures/project';

const item = (id: string, locked?: boolean): FurnitureItem => ({ id, catalogId: 'imported_object', position: { x: 100, y: 100 }, rotation: 0, scale: { x: 1, y: 1, z: 1 }, width: 120, depth: 90, ...(locked ? { locked } : {}) });

/** A room with two boxes, a locked rug, a column and a text label. */
function furnished(): Floor {
  const floor = roomProject().floors[0];
  return { ...floor, furniture: [item('box-a'), item('box-b'), item('rug', true)],
    columns: [{ id: 'column', position: { x: 10, y: 10 }, rotation: 0, shape: 'square', diameter: 30, height: 250, color: '#cccccc' }],
    textAnnotations: [{ id: 'note', x: 0, y: 0, text: 'Reading corner', fontSize: 16, color: '#1e293b', rotation: 0 }] };
}

describe('what Fit frames', () => {
  it('frames the whole plan while the house is not fixed, on a second press, or with no pieces', () => {
    for (const everything of [false, true]) expect(fitIds(furnished(), false, everything)).toBeUndefined();
    expect(fitIds(furnished(), true, true)).toBeUndefined();
    expect(fitIds({ ...furnished(), furniture: [] }, true, false)).toBeUndefined();
  });

  it('frames exactly the pieces, locked ones included, while the house is fixed', () => {
    const floor = furnished();
    expect(fitIds(floor, true, false)).toEqual(new Set(['box-a', 'box-b', 'rug']));
    const ids = fitIds(floor, true, false)!;
    for (const other of [...floor.walls.map(wall => wall.id), 'column', 'note']) expect(ids.has(other)).toBe(false);
  });
});
