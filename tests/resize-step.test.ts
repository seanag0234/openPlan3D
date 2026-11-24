import { describe, expect, it } from 'vitest';
import { resizeFurnitureFromHandle, type FurnitureResizeInput } from '$lib/utils/canvasInteraction';
import { resizeStep, type SnapContext } from '$lib/utils/snapPolicy';

const input: FurnitureResizeInput = {
  position: { x: 150, y: 200 }, rotation: 0, width: 120, depth: 90, scale: { x: 1, y: 1 },
  handle: 'resize-r', pointer: { x: 230.3, y: 200 }, preserveAspectRatio: false,
};

describe('resize step', () => {
  it('leaves a resize free without a step', () => {
    const result = resizeFurnitureFromHandle(input);
    expect(result.scale.x * 120).toBeCloseTo(140.3, 6);
  });

  it('lands a resize on whole inches and keeps the far edge where it is', () => {
    const result = resizeFurnitureFromHandle({ ...input, sizeStep: 2.54 });
    expect(result.scale.x).toBeCloseTo(139.7 / 120, 6);
    expect(result.position.x - 139.7 / 2).toBeCloseTo(90, 6);
    expect(result.position.y).toBeCloseTo(200, 6);
    expect(result.scale.y).toBe(1);
  });

  it('steps by an inch only in feet and inches with snapping on', () => {
    const imperial: SnapContext = { enabled: true, snapToGrid: true, gridSize: 25, units: 'imperial' };
    expect(resizeStep(imperial)).toBe(2.54);
    expect(resizeStep({ ...imperial, enabled: false })).toBeUndefined();
    expect(resizeStep({ ...imperial, units: 'metric' })).toBeUndefined();
  });
});
