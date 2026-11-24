import { describe, expect, it } from 'vitest';
import { gridLineStepCm, gridLinesPx, gridMajorStepCm, pieceStepCm, resizeStep, snapPieceMove, slideAlongWalls, snapValue, stopAtWalls, type SnapContext } from '$lib/utils/snapPolicy';
import { snap } from '$lib/utils/canvasInteraction';
import type { FurnitureItem, Wall } from '$lib/models/types';

const grid: SnapContext = { enabled: true, snapToGrid: true, gridSize: 25, units: 'metric' };
const fine: SnapContext = { ...grid, snapToGrid: false };
const off: SnapContext = { ...grid, enabled: false };
const piece: FurnitureItem = { id: 'box', catalogId: 'imported_object', position: { x: 100, y: 100 }, rotation: 0, scale: { x: 1, y: 1, z: 1 }, width: 120, depth: 90 };
const wall: Wall = { id: 'w', start: { x: 0, y: 0 }, end: { x: 400, y: 0 }, thickness: 15, height: 250, color: '#ccc' };

describe('snap policy in metres', () => {
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

  it('leaves a metric resize free', () => {
    expect(resizeStep(grid)).toBeUndefined();
    expect(resizeStep(off)).toBeUndefined();
  });

  it('lets a piece go where it is dragged, walls or not', () => {
    const wanted = { x: 200, y: 0 };
    expect(stopAtWalls(wanted, piece.position, piece, [wall])).toBe(wanted);
  });

  it('hands back the very point asked for when walls leave the way free, and another when they stop it', () => {
    const free = { x: 160, y: 120 };
    expect(slideAlongWalls(free, piece.position, piece, [wall])).toBe(free);
    const across = { x: 100, y: -100 };
    const stopped = slideAlongWalls(across, piece.position, piece, [wall]);
    expect(stopped).not.toBe(across);
    expect(stopped.y - 45).toBeGreaterThanOrEqual(7.5 - 0.01);
  });
});

describe('snap policy in feet and inches', () => {
  const imperial: SnapContext = { enabled: true, snapToGrid: true, gridSize: 25, units: 'imperial' };

  it('rounds the distance moved, so a piece keeps its row', () => {
    // 40 cm is three 6 in steps on the grid, and 16 one-inch steps off it.
    expect(snapPieceMove({ x: 190, y: 203 }, { x: 150, y: 200 }, imperial)).toEqual({ x: 150 + 3 * 15.24, y: 200 });
    const fine = snapPieceMove({ x: 190, y: 203 }, { x: 150, y: 200 }, { ...imperial, snapToGrid: false });
    expect(fine.x).toBeCloseTo(190.64, 9);
    expect(fine.y).toBeCloseTo(202.54, 9);
    expect(snapPieceMove({ x: 190, y: 203 }, { x: 150, y: 200 }, { ...imperial, enabled: false })).toEqual({ x: 190, y: 203 });
    // A piece off the grid stays on its own row instead of jumping to the nearest grid line.
    expect(snapPieceMove({ x: 190, y: 213 }, { x: 150, y: 210 }, imperial)).toEqual({ x: 150 + 3 * 15.24, y: 210 });
  });

  it('moves a piece 6 in on the grid and 1 in off it; metres keep the grid size and 10 cm', () => {
    expect(pieceStepCm(imperial)).toBe(15.24);
    expect(pieceStepCm({ ...imperial, snapToGrid: false })).toBe(2.54);
    expect(pieceStepCm({ ...imperial, units: 'metric' })).toBe(25);
    expect(pieceStepCm({ ...imperial, units: 'metric', snapToGrid: false })).toBe(10);
  });

  it('draws a grid line every foot and a heavier one every 3 ft; metres keep every metre', () => {
    expect(gridLineStepCm(imperial, 20)).toBe(30.48);
    expect(gridLineStepCm({ ...imperial, snapToGrid: false }, 20)).toBe(30.48);
    expect(gridMajorStepCm(imperial)).toBe(91.44);
    expect(gridMajorStepCm({ ...imperial, units: 'metric' })).toBe(100);
  });
});

describe('which grid lines are drawn', () => {
  const close = (got: { minor: number | null; major: number | null }, minor: number | null, major: number | null) => {
    if (minor === null) expect(got.minor).toBeNull(); else expect(got.minor).toBeCloseTo(minor, 6);
    if (major === null) expect(got.major).toBeNull(); else expect(got.major).toBeCloseTo(major, 6);
  };
  const imperial: SnapContext = { ...grid, units: 'imperial' };

  it('keeps the metric rule: lines at the grid step and heavier ones every metre, none when too close', () => {
    close(gridLinesPx(grid, 1, 20), 25, 100);
    close(gridLinesPx(grid, 0.1, 20), null, null);
  });

  it('draws heavier lines every 3 ft in feet and inches, and the foot lines only when far enough apart', () => {
    close(gridLinesPx(imperial, 1, 20), 30.48, 91.44);
    close(gridLinesPx(imperial, 0.5, 20), null, 45.72);
    close(gridLinesPx(imperial, 0.2, 20), null, null);
  });
});
