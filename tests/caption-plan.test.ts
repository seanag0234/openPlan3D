import { describe, expect, it } from 'vitest';
import { beginCaptions, captionFrameOpen, drawCaptions, placeCaptions, queueCaption, type CaptionRequest } from '$lib/utils/captionPlan';
import { readableCaptionLines } from '$lib/utils/furnitureCaption';
import type { CanvasState } from '$lib/utils/canvasInteraction';

const measure = (text: string) => text.length * 6;

/** A piece of `w` by `d` screen px centred on `c`, turned by `angle` radians. */
function piece(id: string, c: { x: number; y: number }, w: number, d: number, options: Partial<CaptionRequest> = {}): CaptionRequest {
  const angle = options.angle ?? 0;
  const bw = Math.abs(w * Math.cos(angle)) + Math.abs(d * Math.sin(angle)), bd = Math.abs(w * Math.sin(angle)) + Math.abs(d * Math.cos(angle));
  return { id, kind: 'piece', name: id, size: '120 × 90 cm', selected: false,
    box: { left: c.x - bw / 2, top: c.y - bd / 2, right: c.x + bw / 2, bottom: c.y + bd / 2 }, center: c, width: w, depth: d, angle, ...options };
}

const label = (id: string, box: CaptionRequest['box']): CaptionRequest => ({ id, kind: 'label', selected: false, box });
const linesOf = (placed: ReturnType<typeof placeCaptions>, id: string) => placed.filter(line => line.id === id);

/** A context that records what is painted and measures as `measure` does. */
function recorder() {
  const painted: { text: string; x: number; y: number; font: string }[] = [];
  let origin = { x: 0, y: 0 };
  const saved: { x: number; y: number }[] = [];
  const ctx = {
    font: '', textAlign: '', textBaseline: '', lineJoin: '', lineWidth: 0, strokeStyle: '', fillStyle: '',
    save() { saved.push(origin); }, restore() { origin = saved.pop()!; }, strokeText() {},
    translate(x: number, y: number) { origin = { x: origin.x + x, y: origin.y + y }; },
    measureText: (text: string) => ({ width: measure(text) }),
    fillText(text: string, x: number, y: number) { painted.push({ text, x: origin.x + x, y: origin.y + y, font: this.font }); },
  };
  const cs = { ctx: ctx as unknown as CanvasRenderingContext2D, width: 800, height: 600, zoom: 1, camX: 0, camY: 0 } as CanvasState;
  return { cs, painted };
}

describe('the caption frame', () => {
  it('queues nothing outside a frame, so the caller paints as before', () => {
    expect(captionFrameOpen()).toBe(false);
    expect(queueCaption(piece('Box A', { x: 100, y: 100 }, 200, 100))).toBe(false);
  });

  it('takes a piece inside a frame, lets a label only reserve its place, and closes on drawCaptions', () => {
    beginCaptions();
    expect(captionFrameOpen()).toBe(true);
    expect(queueCaption(piece('Box A', { x: 300, y: 300 }, 200, 100))).toBe(true);
    expect(queueCaption(label('Note', { left: 0, top: 0, right: 40, bottom: 20 }))).toBe(false);
    const { cs, painted } = recorder();
    drawCaptions(cs);
    expect(captionFrameOpen()).toBe(false);
    expect(painted.map(({ text, x, y }) => ({ text, x, y }))).toEqual([{ text: 'Box A', x: 300, y: 292.5 }, { text: '120 × 90 cm', x: 300, y: 307.5 }]);
    expect(painted.every(line => line.font === '12px sans-serif')).toBe(true);
    expect(queueCaption(piece('Box A', { x: 300, y: 300 }, 200, 100))).toBe(false);
  });

  it('closes the frame when there is nothing to paint', () => {
    beginCaptions();
    const { cs, painted } = recorder();
    drawCaptions(cs);
    expect(captionFrameOpen()).toBe(false);
    expect(painted).toEqual([]);
  });
});

describe('placing captions', () => {
  const c = { x: 300, y: 300 };
  const tw = measure('120 × 90 cm');

  it('puts both lines where the readable caption puts them today, inside a piece that holds them', () => {
    const placed = placeCaptions([piece('Box A', c, 200, 100)], measure);
    const [name, size] = readableCaptionLines(200, 100, tw);
    expect(placed).toEqual([{ id: 'Box A', text: 'Box A', x: 300, y: 300 + name }, { id: 'Box A', text: '120 × 90 cm', x: 300, y: 300 + size }]);
    expect(name).toBe(-7.5);
    expect(size).toBe(7.5);
  });

  it('puts both lines under a piece too small to hold them, as today', () => {
    const placed = placeCaptions([piece('Box A', c, 40, 40)], measure);
    const [name, size] = readableCaptionLines(40, 40, tw);
    expect(placed.map(line => line.y)).toEqual([300 + name, 300 + size]);
    expect(placed.every(line => line.x === 300)).toBe(true);
  });

  it('keeps only the name of a piece whose size line would cross a neighbour', () => {
    // B's name line clears A's lines, its size line would cross A's name.
    const placed = placeCaptions([piece('A', c, 200, 100), piece('B', { x: 300, y: 278 }, 200, 100)], measure);
    expect(linesOf(placed, 'A')).toHaveLength(2);
    expect(linesOf(placed, 'B')).toEqual([{ id: 'B', text: 'B', x: 300, y: 270.5 }]);
  });

  it('moves a name that would cross under the piece, and over it when under is taken', () => {
    const placed = placeCaptions([piece('A', c, 200, 100), piece('B', c, 200, 100), piece('C', c, 200, 100)], measure);
    expect(linesOf(placed, 'A').map(line => line.y)).toEqual([292.5, 307.5]);
    expect(linesOf(placed, 'B')).toEqual([{ id: 'B', text: 'B', x: 300, y: 300 + 50 + 4 + 7.5 }]);
    expect(linesOf(placed, 'C')).toEqual([{ id: 'C', text: 'C', x: 300, y: 300 - 50 - 4 - 7.5 }]);
  });

  it('moves a piece caption out of a label, never the label', () => {
    const note = label('Note', { left: 250, top: 280, right: 350, bottom: 320 });
    const placed = placeCaptions([piece('A', c, 200, 100), note], measure);
    expect(linesOf(placed, 'Note')).toEqual([]);
    expect(linesOf(placed, 'A')).toEqual([{ id: 'A', text: 'A', x: 300, y: 361.5 }]);
  });

  it('places the selected piece first, whatever the order queued', () => {
    const placed = placeCaptions([piece('A', c, 200, 100), piece('B', c, 200, 100, { selected: true })], measure);
    expect(linesOf(placed, 'B').map(line => line.y)).toEqual([292.5, 307.5]);
    expect(placed[0].id).toBe('B');
    expect(linesOf(placed, 'A')).toHaveLength(1);
  });

  it('shortens the name of a piece with every place around it taken', () => {
    const taken = [
      label('in', { left: 200, top: 250, right: 400, bottom: 350 }),
      label('under', { left: 200, top: 350, right: 400, bottom: 400 }),
      label('over', { left: 200, top: 200, right: 400, bottom: 250 }),
      label('right', { left: 400, top: 250, right: 600, bottom: 350 }),
      label('left', { left: 0, top: 250, right: 200, bottom: 350 }),
    ];
    const placed = placeCaptions([...taken, piece('Long sofa name', c, 60, 40)], measure);
    expect(placed).toEqual([{ id: 'Long sofa name', text: 'Long so…', x: 300, y: 300 }]);
    expect(measure('Long so…')).toBeLessThanOrEqual(60 - 8);
  });

  it('keeps at least one character of a name it shortens', () => {
    const placed = placeCaptions([label('all', { left: 0, top: 0, right: 600, bottom: 600 }), piece('Wardrobe', c, 4, 4)], measure);
    expect(placed).toEqual([{ id: 'Wardrobe', text: 'W…', x: 300, y: 300 }]);
  });

  it('reads a turned piece upright, under its upright box and never inside it', () => {
    const placed = placeCaptions([piece('Box A', c, 200, 60, { size: '2 m × 60 cm', angle: Math.PI / 2 })], measure);
    expect(placed.map(line => line.text)).toEqual(['Box A', '2 m × 60 cm']);
    expect(placed.map(line => line.y)).toEqual([300 + 100 + 4 + 7.5, 300 + 100 + 4 + 22.5]);
    expect(placed.every(line => line.x === 300)).toBe(true);
  });
});
