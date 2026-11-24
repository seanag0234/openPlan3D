import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { drawRooms, drawStair, drawTextAnnotations } from '$lib/utils/canvasRenderer';
import { beginCaptions, drawCaptions } from '$lib/utils/captionPlan';
import { textAnnotationBounds } from '$lib/utils/textAnnotationLayout';
import { hitTestTextAnnotation } from '$lib/utils/hitTesting';
import { planContentBounds } from '$lib/utils/planContentBounds';
import { getRoomPolygon, resolveRooms } from '$lib/utils/roomDetection';
import { projectSettings } from '$lib/stores/settings';
import type { CanvasState } from '$lib/utils/canvasInteraction';
import type { Floor, Stair, TextAnnotation } from '$lib/models/types';
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

/** A context that records the font of every text painted, and measures 0.6 of the font's px a character. */
function recorder() {
  const painted: { text: string; font: string; y: number }[] = [];
  const state: Record<string, unknown> = { font: '10px sans-serif' };
  const px = () => Number(/([\d.]+)px/.exec(String(state.font))?.[1] ?? 0);
  const ctx = new Proxy(state, {
    get(target, key) {
      if (key === 'measureText') return (text: string) => ({ width: String(text).length * px() * 0.6 });
      if (key === 'fillText') return (text: string, _x: number, y: number) => painted.push({ text: String(text), font: String(target.font), y });
      if (key in target) return target[key as string];
      return () => {};
    },
    set(target, key, value) { target[key as string] = value; return true; },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, painted };
}

/** Paint inside the editor's frame, as the editor does, and close the frame after. */
function inFrame(paint: () => void) {
  beginCaptions();
  try { paint(); } finally { drawCaptions({ ctx: { save() {}, restore() {} } as unknown as CanvasRenderingContext2D, width: 800, height: 600, zoom: 1, camX: 0, camY: 0 }); }
}

const stair: Stair = { id: 'stair', position: { x: 0, y: 0 }, rotation: 0, width: 100, depth: 300, riserCount: 14, direction: 'up', stairType: 'straight' };

describe('room names and stairs labels on the plan', () => {
  beforeEach(() => {
    // Room fills load floor textures; nothing loads in Node.
    vi.stubGlobal('Image', class { complete = false; naturalWidth = 0; onload: unknown; onerror: unknown; set src(_value: string) {} });
  });
  afterEach(() => vi.unstubAllGlobals());

  function roomFonts(zoom: number) {
    const floor = roomProject().floors[0];
    const rooms = resolveRooms(floor).map(room => ({ ...room, name: 'Kitchen' }));
    const { ctx, painted } = recorder();
    const settings = { ...get(projectSettings), units: 'metric' as const, showDimensions: true, showInternalDimensions: true, wallMeasureMode: 'centerline' as const };
    drawRooms({ ctx, width: 800, height: 600, zoom, camX: 200, camY: 150 }, floor, rooms, null, true, true, settings);
    return { name: painted.find(line => line.text.startsWith('Kitchen'))!, size: painted.find(line => line.text.includes(' × '))! };
  }

  function stairFonts(zoom: number, stairType: Stair['stairType'] = 'straight') {
    const { ctx, painted } = recorder();
    drawStair({ ctx, width: 800, height: 600, zoom, camX: 0, camY: 0 }, { ...stair, stairType }, false);
    return painted.filter(line => line.text.startsWith('UP')).map(line => line.font);
  }

  it('never read under 12 px in the editor', () => {
    let room!: ReturnType<typeof roomFonts>, straight: string[] = [], spiral: string[] = [];
    inFrame(() => { room = roomFonts(0.2); straight = stairFonts(0.2); spiral = stairFonts(0.2, 'spiral'); });
    expect(room.name.font).toBe('12px sans-serif');
    expect(room.size.font).toBe('12px sans-serif');
    expect(straight).toEqual(['12px sans-serif']);
    expect(spiral).toEqual(['12px sans-serif']);
  });

  it('keep the sizes they have in the picture, the PDF and the print page', () => {
    const room = roomFonts(0.2);
    expect(room.name.font).toBe('11px sans-serif');
    expect(room.size.font).toBe('9px sans-serif');
    expect(stairFonts(0.2)).toEqual(['8px sans-serif']);
    expect(stairFonts(0.2, 'spiral')).toEqual(['8px sans-serif']);
  });
});

const note: TextAnnotation = { id: 'note', x: 0, y: 0, text: 'Reading corner', fontSize: 16, color: '#1e293b', rotation: 0 };

describe('the place a label takes', () => {
  it('reaches as wide as the label is drawn at 12 px when Fit asks for it', () => {
    const { ctx } = recorder();
    const small = textAnnotationBounds(note, ctx, 0.1), floored = textAnnotationBounds(note, ctx, 0.1, 12);
    expect(floored.maxX - floored.minX).toBeGreaterThan(small.maxX - small.minX);
    expect(floored.maxX - floored.minX).toBeCloseTo((14 * 12 * 0.6 + 2) / 0.1, 6);
  });

  it('frames a room name at 12 px when Fit is told text reads at 12 px at least', () => {
    const floor = roomProject().floors[0];
    const roomLabels = resolveRooms(floor).map(room => ({ room: { ...room, name: 'Kitchen' }, polygon: getRoomPolygon(room, floor.walls) }));
    const { ctx } = recorder();
    const bare = { ...floor, walls: [] };
    const plain = planContentBounds(bare, { context: ctx, entourageAspect: () => 1, roomLabels, zoom: 0.05 })!;
    const floored = planContentBounds(bare, { context: ctx, entourageAspect: () => 1, roomLabels, zoom: 0.05, labelFloorPx: 12 })!;
    expect(floored.maxX - floored.minX).toBeGreaterThan(plain.maxX - plain.minX);
  });
});

describe('where a label answers a press', () => {
  const floor = (): Floor => ({ ...roomProject().floors[0], textAnnotations: [note] });

  it('reaches as far down as the label is drawn at 12 px when zoomed out', () => {
    const { ctx } = recorder();
    // At a quarter zoom the label is drawn at 12 px: 13 screen px below its middle is still on it.
    expect(hitTestTextAnnotation({ x: 0, y: 52 }, floor(), ctx, 0.25)).toBe('note');
  });

  it('reaches as wide as the label is drawn when zoomed in', () => {
    const { ctx } = recorder();
    // At zoom 2 the label is drawn at 32 px: its drawn width in plan units is that width over 2.
    const drawn = 14 * 32 * 0.6 / 2;
    expect(hitTestTextAnnotation({ x: drawn / 3, y: 0 }, floor(), ctx, 2)).toBe('note');
  });
});
