import { describe, expect, it } from 'vitest';
import { gridLineStepCm, resizeStep, snapPieceMove, snapValue, stopAtWalls, type SnapContext } from '$lib/utils/snapPolicy';
import { snap } from '$lib/utils/canvasInteraction';
import type { FurnitureItem, Wall } from '$lib/models/types';

const grid: SnapContext = { enabled: true, snapToGrid: true, gridSize: 25, units: 'metric' };
const fine: SnapContext = { ...grid, snapToGrid: false };
const off: SnapContext = { ...grid, enabled: false };
const piece: FurnitureItem = { id: 'box', catalogId: 'imported_object', position: { x: 100, y: 100 }, rotation: 0, scale: { x: 1, y: 1, z: 1 }, width: 120, depth: 90 };
const wall: Wall = { id: 'w', start: { x: 0, y: 0 }, end: { x: 400, y: 0 }, thickness: 15, height: 250, color: '#ccc' };

describe('snap policy, as the editor does today', () => {
  it('draws grid lines at the snap step on the grid and at the fallback otherwise', () => {
    expect(gridLineStepCm(grid, 20)).toBe(25);
    expect(gridLineStepCm({ ...grid, gridSize: 50 }, 20)).toBe(50);
    expect(gridLineStepCm(fine, 20)).toBe(20);
  });

  it('rounds a value as the plan snap does', () => {
    for (const s of [grid, fine, off]) for (const v of [-37, 0, 12.4, 13, 101, 262.5]) {
      expect(snapValue(v, s)).toBe(snap(v, s.enabled, s.snapToGrid, s.gridSize));
    }
    expect(snapValue(37, grid)).toBe(25);
    expect(snapValue(37, fine)).toBe(40);
    expect(snapValue(37, off)).toBe(37);
  });

  it('lands a dragged piece on the rounded pointer position, wherever it started', () => {
    expect(snapPieceMove({ x: 137, y: 61 }, { x: 3, y: 4 }, grid)).toEqual({ x: 125, y: 50 });
    expect(snapPieceMove({ x: 137, y: 61 }, { x: 3, y: 4 }, off)).toEqual({ x: 137, y: 61 });
  });

  it('leaves a resize free', () => {
    expect(resizeStep(grid)).toBeUndefined();
    expect(resizeStep(off)).toBeUndefined();
  });

  it('lets a piece go where it is dragged, walls or not', () => {
    const wanted = { x: 200, y: 0 };
    expect(stopAtWalls(wanted, piece.position, piece, [wall])).toBe(wanted);
  });
});
