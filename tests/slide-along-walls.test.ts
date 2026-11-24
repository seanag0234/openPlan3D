import { describe, expect, it } from 'vitest';
import { slideAlongWalls, stopAtWalls } from '$lib/utils/snapPolicy';
import { currentProject } from '$lib/stores/project';
import type { FurnitureItem, Wall } from '$lib/models/types';
import { roomProject } from './fixtures/project';

const piece: FurnitureItem = { id: 'box', catalogId: 'imported_object', position: { x: 100, y: 100 }, rotation: 0, scale: { x: 1, y: 1, z: 1 }, width: 120, depth: 90 };
const wall: Wall = { id: 'w', start: { x: 0, y: 0 }, end: { x: 400, y: 0 }, thickness: 15, height: 250, color: '#ccc' };

describe('a piece stops at a wall', () => {
  it("stops with its edge on the wall's face", () => {
    const at = slideAlongWalls({ x: 100, y: 30 }, { x: 100, y: 100 }, piece, [wall]);
    expect(at.x).toBeCloseTo(100, 6);
    expect(Math.abs(at.y - 52.5)).toBeLessThan(0.5);
  });

  it('slides along the wall', () => {
    const at = slideAlongWalls({ x: 160, y: 30 }, { x: 100, y: 100 }, piece, [wall]);
    expect(at.x).toBeCloseTo(160, 6);
    expect(Math.abs(at.y - 52.5)).toBeLessThan(0.5);
  });

  it('does not jump the wall on a fast drag', () => {
    const at = slideAlongWalls({ x: 100, y: -100 }, { x: 100, y: 100 }, piece, [wall]);
    expect(Math.abs(at.y - 52.5)).toBeLessThan(0.5);
  });

  it('lets out a piece that is already in a wall', () => {
    const wanted = { x: 100, y: -100 };
    expect(slideAlongWalls(wanted, { x: 100, y: 20 }, piece, [wall])).toBe(wanted);
  });

  it('is not stopped by a curved wall', () => {
    const wanted = { x: 100, y: -100 };
    expect(slideAlongWalls(wanted, { x: 100, y: 100 }, piece, [{ ...wall, curvePoint: { x: 200, y: 40 } }])).toBe(wanted);
  });

  it('only while the house is fixed', () => {
    const wanted = { x: 100, y: -100 };
    currentProject.set(roomProject());
    expect(stopAtWalls(wanted, { x: 100, y: 100 }, piece, [wall])).toBe(wanted);
    currentProject.set({ ...roomProject(), houseFixed: true });
    expect(Math.abs(stopAtWalls(wanted, { x: 100, y: 100 }, piece, [wall]).y - 52.5)).toBeLessThan(0.5);
    currentProject.set(null);
  });
});
