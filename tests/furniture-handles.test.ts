import { describe, expect, it } from 'vitest';
import type { FurnitureItem } from '$lib/models/types';
import { drawFurnitureItem } from '$lib/utils/canvasRenderer';

const piece: FurnitureItem = { id: 'box', catalogId: 'imported_object', position: { x: 0, y: 0 }, rotation: 0, scale: { x: 1, y: 1, z: 1 }, width: 120, depth: 90 };

/** What a selected piece paints, in screen px, from its dashed outline on: the handles' squares and discs. */
function selection(item: FurnitureItem, coarse?: boolean) {
  let matrix = [1, 0, 0, 1, 0, 0];
  const stack: number[][] = [];
  const point = (x: number, y: number) => ({ x: matrix[0] * x + matrix[2] * y + matrix[4], y: matrix[1] * x + matrix[3] * y + matrix[5] });
  const calls: { name: string; args: unknown[]; at?: { x: number; y: number } }[] = [];
  const methods: Record<string, (...args: any[]) => unknown> = {
    save() { stack.push([...matrix]); },
    restore() { matrix = stack.pop() ?? matrix; },
    translate(x: number, y: number) { const p = point(x, y); matrix = [matrix[0], matrix[1], matrix[2], matrix[3], p.x, p.y]; },
    scale(x: number, y: number) { matrix = [matrix[0] * x, matrix[1] * x, matrix[2] * y, matrix[3] * y, matrix[4], matrix[5]]; },
    rotate(angle: number) {
      const [a, b, c, d] = matrix, cos = Math.cos(angle), sin = Math.sin(angle);
      matrix = [a * cos + c * sin, b * cos + d * sin, c * cos - a * sin, d * cos - b * sin, matrix[4], matrix[5]];
    },
    measureText: (text: string) => ({ width: text.length * 6 }),
    setLineDash(dash: number[]) { calls.push({ name: 'setLineDash', args: [dash] }); },
    fillRect(x: number, y: number, w: number, h: number) { calls.push({ name: 'fillRect', args: [w, h], at: point(x + w / 2, y + h / 2) }); },
    strokeRect(x: number, y: number, w: number, h: number) { calls.push({ name: 'strokeRect', args: [w, h], at: point(x + w / 2, y + h / 2) }); },
    arc(x: number, y: number, r: number) { calls.push({ name: 'arc', args: [r], at: point(x, y) }); },
  };
  const ctx = new Proxy(methods, {
    get: (target, key) => target[key as string] ?? (() => {}),
    set: () => true,
  }) as unknown as CanvasRenderingContext2D;
  drawFurnitureItem({ ctx, width: 0, height: 0, zoom: 1, camX: 0, camY: 0, coarse }, item, true);
  const from = calls.findIndex(call => call.name === 'setLineDash' && JSON.stringify(call.args[0]) === '[4,3]');
  const after = calls.slice(from + 1);
  const round = (p: { x: number; y: number }) => ({ x: Math.round(p.x * 1e6) / 1e6 + 0, y: Math.round(p.y * 1e6) / 1e6 + 0 });
  return {
    outline: after.find(call => call.name === 'strokeRect'),
    squares: after.filter(call => call.name === 'fillRect').map(call => ({ ...round(call.at!), size: call.args[0] })),
    discs: after.filter(call => call.name === 'arc').map(call => ({ ...round(call.at!), radius: call.args[0] })),
  };
}

describe('the handles of a selected piece', () => {
  it('stay where and as big as they are for a mouse', () => {
    const { squares, discs } = selection(piece);
    expect(squares).toEqual([
      { x: -60, y: -45, size: 10 }, { x: 60, y: -45, size: 10 }, { x: -60, y: 45, size: 10 }, { x: 60, y: 45, size: 10 },
      { x: 0, y: -45, size: 8 }, { x: 0, y: 45, size: 8 }, { x: -60, y: 0, size: 8 }, { x: 60, y: 0, size: 8 },
    ]);
    expect(discs[0]).toEqual({ x: 0, y: -45 - 18, radius: 5 });
  });

  it('are bigger and stand outside the piece for a finger', () => {
    const { squares, discs } = selection(piece, true);
    expect(squares).toEqual([
      { x: -70, y: -55, size: 18 }, { x: 70, y: -55, size: 18 }, { x: -70, y: 55, size: 18 }, { x: 70, y: 55, size: 18 },
      { x: 0, y: -55, size: 16 }, { x: 0, y: 55, size: 16 }, { x: -70, y: 0, size: 16 }, { x: 70, y: 0, size: 16 },
    ]);
    expect(discs[0]).toEqual({ x: 0, y: -45 - 48, radius: 9 });
  });

});
