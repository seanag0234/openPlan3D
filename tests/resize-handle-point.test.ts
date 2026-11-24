import { describe, expect, it } from 'vitest';
import { resizeHandlePoint } from '$lib/utils/canvasInteraction';

describe('where a resize handle is on the plan', () => {
  it('puts a corner handle on the corner and an edge handle at the middle of its edge', () => {
    const br = resizeHandlePoint({ x: 0, y: 0 }, 0, 200, 100, 'resize-br');
    expect(br.x).toBeCloseTo(100, 9); expect(br.y).toBeCloseTo(50, 9);
    const t = resizeHandlePoint({ x: 0, y: 0 }, 0, 200, 100, 'resize-t');
    expect(t.x).toBeCloseTo(0, 9); expect(t.y).toBeCloseTo(-50, 9);
    const tl = resizeHandlePoint({ x: 30, y: 40 }, 0, 200, 100, 'resize-tl');
    expect(tl.x).toBeCloseTo(-70, 9); expect(tl.y).toBeCloseTo(-10, 9);
  });

  it('turns the handle with the piece', () => {
    const br = resizeHandlePoint({ x: 0, y: 0 }, 90, 200, 100, 'resize-br');
    expect(br.x).toBeCloseTo(-50, 9); expect(br.y).toBeCloseTo(100, 9);
    const r = resizeHandlePoint({ x: 0, y: 0 }, 90, 200, 100, 'resize-r');
    expect(r.x).toBeCloseTo(0, 9); expect(r.y).toBeCloseTo(100, 9);
  });
});
