import { describe, expect, it } from 'vitest';
import { cameraAfterResize, screenToWorld, type CanvasState } from '$lib/utils/canvasInteraction';

// A page point under the pointer must keep its plan position when the canvas box changes, for
// example when selecting a piece opens the 256 px properties panel beside the canvas mid-drag.
function planPointAtPage(box: { left: number; top: number; width: number; height: number }, cam: { x: number; y: number }, zoom: number, page: { x: number; y: number }) {
  const cs = { width: box.width, height: box.height, zoom, camX: cam.x, camY: cam.y } as CanvasState;
  return screenToWorld(cs, page.x - box.left, page.y - box.top);
}

describe('cameraAfterResize', () => {
  const zoom = 0.8, cam = { x: 120, y: -40 }, finger = { x: 700, y: 400 };
  const cases = {
    'panel opens on the right': [{ left: 240, top: 48, width: 1200, height: 816 }, { left: 240, top: 48, width: 944, height: 816 }],
    'panel closes on the right': [{ left: 240, top: 48, width: 944, height: 816 }, { left: 240, top: 48, width: 1200, height: 816 }],
    'box moves and shrinks on both axes': [{ left: 0, top: 0, width: 800, height: 600 }, { left: 30, top: 10, width: 500, height: 400 }],
  } as const;
  for (const [name, [before, after]] of Object.entries(cases)) {
    it(`keeps the plan point under the pointer when the ${name}`, () => {
      const next = cameraAfterResize(cam, zoom, before, after);
      const was = planPointAtPage(before, cam, zoom, finger), now = planPointAtPage(after, next, zoom, finger);
      expect(now.x).toBeCloseTo(was.x, 9);
      expect(now.y).toBeCloseTo(was.y, 9);
    });
  }

  it('leaves the camera alone on the first sizing, when there is no earlier box', () => {
    expect(cameraAfterResize(cam, zoom, null, { left: 0, top: 0, width: 800, height: 600 })).toEqual(cam);
    expect(cameraAfterResize(cam, zoom, { left: 0, top: 0, width: 0, height: 0 }, { left: 0, top: 0, width: 800, height: 600 })).toEqual(cam);
  });
});
