import { describe, expect, it } from 'vitest';
import { beginCaptions, drawCaptions, queueCaption } from '$lib/utils/captionPlan';
import type { CanvasState } from '$lib/utils/canvasInteraction';

describe('caption plan, as the editor does today', () => {
  it('leaves every caption for its caller to draw', () => {
    beginCaptions();
    const box = { left: 10, top: 10, right: 110, bottom: 60 };
    expect(queueCaption({ id: 'box-a', kind: 'piece', name: 'Box A', size: '120 × 90 cm', selected: false, box })).toBe(false);
    expect(queueCaption({ id: 'label', kind: 'label', selected: true, box })).toBe(false);
    const calls: string[] = [];
    const ctx = new Proxy({}, { get: (_, key) => () => { calls.push(String(key)); } }) as unknown as CanvasRenderingContext2D;
    const cs: CanvasState = { ctx, width: 800, height: 600, zoom: 1, camX: 0, camY: 0 };
    drawCaptions(cs);
    expect(calls).toEqual([]);
  });
});
