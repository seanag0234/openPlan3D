import { describe, expect, it } from 'vitest';
import { drawTextAnnotations } from '$lib/utils/canvasRenderer';
import { beginCaptions, drawCaptions } from '$lib/utils/captionPlan';
import type { CanvasState } from '$lib/utils/canvasInteraction';
import type { Floor } from '$lib/models/types';
import { roomProject } from './fixtures/project';

/** The fonts the label is painted in, drawn at a quarter zoom. */
function fontsAtQuarterZoom(): string[] {
  const fonts: string[] = [];
  const ctx = new Proxy({ font: '' } as Record<string, unknown>, {
    get(target, key) {
      if (key === 'measureText') return (text: string) => ({ width: text.length * 6 });
      if (key === 'fillText') return () => fonts.push(String(target.font));
      if (key in target) return target[key as string];
      return () => {};
    },
    set(target, key, value) { target[key as string] = value; return true; },
  }) as unknown as CanvasRenderingContext2D;
  const cs: CanvasState = { ctx, width: 800, height: 600, zoom: 0.25, camX: 0, camY: 0 };
  const floor: Floor = { ...roomProject().floors[0], textAnnotations: [{ id: 'note', x: 0, y: 0, text: 'Reading corner', fontSize: 16, color: '#1e293b', rotation: 0 }] };
  drawTextAnnotations(cs, floor, null, null);
  return fonts;
}

describe('labels on the plan', () => {
  it('never read under 12 px in the editor', () => {
    beginCaptions();
    const fonts = fontsAtQuarterZoom();
    drawCaptions({ ctx: { save() {}, restore() {} } as unknown as CanvasRenderingContext2D, width: 800, height: 600, zoom: 1, camX: 0, camY: 0 });
    expect(fonts).toEqual(['12px sans-serif']);
  });

  it('keep 8 px in the picture, the PDF and the print page', () => {
    expect(fontsAtQuarterZoom()).toEqual(['8px sans-serif']);
  });
});
