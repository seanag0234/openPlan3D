import { describe, expect, it } from 'vitest';
import type { FurnitureItem, Point } from '$lib/models/types';
import type { HandleType } from '$lib/utils/canvasInteraction';
import { COARSE_HANDLE, FINE_HANDLE } from '$lib/utils/handleGeometry';
import { findHandleAt } from '$lib/utils/hitTesting';

// A made-up box, 120 by 80 cm, turned 30 degrees, standing at (200, 100).
const box = (updates: Partial<FurnitureItem> = {}): FurnitureItem => ({
  id: 'box', catalogId: 'imported_object', position: { x: 200, y: 100 }, rotation: 30,
  scale: { x: 1, y: 1, z: 1 }, width: 120, depth: 80, ...updates,
});
const hw = 60, hd = 40;

/** A point given in the box's own frame, in world cm. */
function world(piece: FurnitureItem, rx: number, ry: number): Point {
  const a = (piece.rotation * Math.PI) / 180;
  return { x: piece.position.x + rx * Math.cos(a) - ry * Math.sin(a), y: piece.position.y + rx * Math.sin(a) + ry * Math.cos(a) };
}

/** How the handles were found before handles had a geometry: squares 8 px across each way, in this order. */
function before(p: Point, piece: FurnitureItem, zoom: number): HandleType | null {
  const a = -(piece.rotation * Math.PI) / 180;
  const dx = p.x - piece.position.x, dy = p.y - piece.position.y;
  const rx = dx * Math.cos(a) - dy * Math.sin(a), ry = dx * Math.sin(a) + dy * Math.cos(a);
  const ht = 8 / zoom, turn = 18 / zoom;
  const near = (x: number, y: number) => Math.abs(rx - x) < ht && Math.abs(ry - y) < ht;
  if (near(0, -hd - turn)) return 'rotate';
  if (near(-hw, -hd)) return 'resize-tl';
  if (near(hw, -hd)) return 'resize-tr';
  if (near(-hw, hd)) return 'resize-bl';
  if (near(hw, hd)) return 'resize-br';
  if (near(0, -hd)) return 'resize-t';
  if (near(0, hd)) return 'resize-b';
  if (near(-hw, 0)) return 'resize-l';
  if (near(hw, 0)) return 'resize-r';
  return null;
}

describe('selection handles under a mouse', () => {
  it('give the same answers as before, on a turned piece, at any zoom', () => {
    const piece = box();
    for (const zoom of [0.5, 1, 2]) {
      let found = 0;
      for (let rx = -hw - 30; rx <= hw + 30; rx += 1.5) {
        for (let ry = -hd - 60; ry <= hd + 30; ry += 1.5) {
          const p = world(piece, rx, ry);
          const expected = before(p, piece, zoom);
          if (expected) found++;
          expect(findHandleAt(p, piece.id, [piece], zoom)).toBe(expected);
          expect(findHandleAt(p, piece.id, [piece], zoom, FINE_HANDLE)).toBe(expected);
        }
      }
      expect(found).toBeGreaterThan(50);
    }
  });

  it('answer 7 px from a corner and not 9 px', () => {
    const piece = box();
    expect(findHandleAt(world(piece, hw + 7, hd), piece.id, [piece], 1)).toBe('resize-br');
    expect(findHandleAt(world(piece, hw + 9, hd), piece.id, [piece], 1)).toBeNull();
  });
});

describe('selection handles under a finger', () => {
  const zoom = 2;
  const px = (n: number) => n / zoom;
  const out = px(COARSE_HANDLE.outset);

  it('sit outside the corners and edges, with the turn handle further out', () => {
    const piece = box();
    const at = (rx: number, ry: number) => findHandleAt(world(piece, rx, ry), piece.id, [piece], zoom, COARSE_HANDLE);
    expect(at(-hw - out, -hd - out)).toBe('resize-tl');
    expect(at(hw + out, -hd - out)).toBe('resize-tr');
    expect(at(-hw - out, hd + out)).toBe('resize-bl');
    expect(at(hw + out, hd + out)).toBe('resize-br');
    expect(at(0, -hd - out)).toBe('resize-t');
    expect(at(0, hd + out)).toBe('resize-b');
    expect(at(-hw - out, 0)).toBe('resize-l');
    expect(at(hw + out, 0)).toBe('resize-r');
    expect(at(0, -hd - px(18 + 3 * COARSE_HANDLE.outset))).toBe('rotate');
  });

  it('answer 20 px outside a corner', () => {
    const piece = box();
    const d = px(20) / Math.SQRT2;
    expect(findHandleAt(world(piece, hw + d, hd + d), piece.id, [piece], zoom, COARSE_HANDLE)).toBe('resize-br');
    expect(findHandleAt(world(piece, -hw - px(20), -hd), piece.id, [piece], zoom, COARSE_HANDLE)).toBe('resize-tl');
  });

  it('never answer inside the piece, even 5 px inside a corner', () => {
    const piece = box();
    const d = px(5);
    expect(findHandleAt(world(piece, hw - d, hd - d), piece.id, [piece], zoom, COARSE_HANDLE)).toBeNull();
    expect(findHandleAt(world(piece, 0, hd - d), piece.id, [piece], zoom, COARSE_HANDLE)).toBeNull();
  });

  it('give the nearest handle, and nothing beyond reach', () => {
    const piece = box();
    // Just outside the right edge, a little below its middle: the right edge handle, not a corner.
    expect(findHandleAt(world(piece, hw + px(2), px(10)), piece.id, [piece], zoom, COARSE_HANDLE)).toBe('resize-r');
    expect(findHandleAt(world(piece, hw + out + px(COARSE_HANDLE.reach + 2), 0), piece.id, [piece], zoom, COARSE_HANDLE)).toBeNull();
  });
});

describe('a locked piece', () => {
  it('has no handles, under a mouse or a finger', () => {
    const piece = box({ locked: true });
    expect(findHandleAt(world(piece, hw, hd), piece.id, [piece], 1)).toBeNull();
    expect(findHandleAt(world(piece, hw + 10, hd + 10), piece.id, [piece], 1, COARSE_HANDLE)).toBeNull();
    expect(findHandleAt(world(piece, 0, -hd - 18), piece.id, [piece], 1)).toBeNull();
  });
});
