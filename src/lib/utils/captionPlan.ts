import type { CanvasState } from './canvasInteraction';
import { READABLE_CAPTION_PX } from './furnitureCaption';

/** A caption the plan wants drawn: a piece's name and size, or a text label. */
export interface CaptionRequest { id: string; kind: 'piece' | 'label'; name?: string; size?: string; selected: boolean;
  /** The thing's upright bounds on screen. */
  box: { left: number; top: number; right: number; bottom: number };
  /** For a piece, in screen px and radians: its centre, its own width and depth, and how far it is turned. */
  center?: { x: number; y: number }; width?: number; depth?: number; angle?: number }

/** One line of a piece's caption, centred on x, y in screen px, painted upright. */
export interface PlacedLine { id: string; text: string; x: number; y: number }

type Box = CaptionRequest['box'];

/** Height of one caption line: 12 px text at a 1.25 line height. */
const LINE = READABLE_CAPTION_PX * 1.25;

let frame: CaptionRequest[] | null = null;

/** Start a frame's captions: from now until drawCaptions, pieces hand their captions here. */
export function beginCaptions(): void { frame = []; }

/** True between beginCaptions and drawCaptions. */
export function captionFrameOpen(): boolean { return frame !== null; }

/**
 * Hand a caption to the frame. True when drawCaptions will paint it, so the caller must not: a
 * piece's caption inside a frame. A label only reserves its place; its caller still paints it.
 * Outside a frame (the picture, the PDF, the print page) nothing is queued and the caller paints.
 */
export function queueCaption(request: CaptionRequest): boolean {
  if (!frame) return false;
  frame.push(request);
  return request.kind === 'piece';
}

const overlaps = (a: Box, b: Box) =>
  Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5;

/**
 * Where every piece's lines go. Pure: `measure` gives a text's width at 12 px. Labels' boxes are
 * taken first. Then every piece gets its name, selected pieces first: where the readable caption
 * puts it, else under, over, right or left of the piece, else shortened with "…" on the piece,
 * under or over it. Only once every name is placed does each size line go in, under its name and
 * only where it is still clear, so no piece loses its name to a neighbour's size. A name with no
 * clear place, even shortened, is not drawn in this frame; it comes back when there is room, or
 * when the piece is selected. Lines come back grouped by piece, name then size, in placing order.
 */
export function placeCaptions(requests: readonly CaptionRequest[], measure: (text: string) => number): PlacedLine[] {
  const placed: Box[] = requests.filter(r => r.kind === 'label').map(r => r.box);
  const pieces = requests.filter(r => r.kind === 'piece');
  const ordered = [...pieces.filter(r => r.selected), ...pieces.filter(r => !r.selected)];
  const boxOf = (line: PlacedLine): Box => {
    const half = measure(line.text) / 2;
    return { left: line.x - half, top: line.y - LINE / 2, right: line.x + half, bottom: line.y + LINE / 2 };
  };
  const clear = (line: PlacedLine) => !placed.some(box => overlaps(boxOf(line), box));
  const kept = new Map<string, PlacedLine[]>();
  const sizes: PlacedLine[] = [];

  // Every name first, so no piece loses its name to a neighbour's size.
  for (const piece of ordered) {
    const name = piece.name ?? '';
    const c = piece.center ?? { x: (piece.box.left + piece.box.right) / 2, y: (piece.box.top + piece.box.bottom) / 2 };
    const w = piece.width ?? piece.box.right - piece.box.left, d = piece.depth ?? piece.box.bottom - piece.box.top;
    const a = piece.angle ?? 0, cos = Math.abs(Math.cos(a)), sin = Math.abs(Math.sin(a));
    const bw = w * cos + d * sin, bd = w * sin + d * cos;
    const nameWidth = measure(name), tw = Math.max(nameWidth, measure(piece.size ?? ''));

    const inside = tw * cos + 2 * LINE * sin + 8 <= w && tw * sin + 2 * LINE * cos + 6 <= d;
    const nameY = inside ? c.y - LINE / 2 : c.y + bd / 2 + 4 + LINE / 2;
    const sizeY = inside ? c.y + LINE / 2 : c.y + bd / 2 + 4 + LINE * 1.5;
    const named = (x: number, y: number, text = name): PlacedLine => ({ id: piece.id, text, x, y });

    const under = c.y + bd / 2 + 4 + LINE / 2, over = c.y - bd / 2 - 4 - LINE / 2;
    let line = [named(c.x, nameY), named(c.x, under), named(c.x, over),
      named(c.x + bw / 2 + 4 + nameWidth / 2, c.y), named(c.x - bw / 2 - 4 - nameWidth / 2, c.y)].find(clear);
    if (!line) {
      const room = Math.max(bw, 24) - 8;
      let text = name;
      while (text.length > 1 && measure(text + '…') > room) text = text.slice(0, -1);
      line = [named(c.x, c.y, text + '…'), named(c.x, under, text + '…'), named(c.x, over, text + '…')].find(clear);
    }
    // No clear place at this zoom: the piece goes without a caption in this frame.
    if (!line) continue;
    placed.push(boxOf(line)); kept.set(piece.id, [line]);
    if (line.text === name && line.x === c.x && line.y === nameY) sizes.push(named(c.x, sizeY, piece.size ?? ''));
  }
  // Then each size, only where it is still clear.
  for (const line of sizes) if (clear(line)) { placed.push(boxOf(line)); kept.get(line.id)!.push(line); }
  return ordered.flatMap(piece => kept.get(piece.id) ?? []);
}

/** Place the frame's queued captions, paint them upright in the frame's own coordinates, and close the frame. */
export function drawCaptions(cs: CanvasState): void {
  const queued = frame ?? [];
  frame = null;
  if (!queued.some(request => request.kind === 'piece')) return;
  const { ctx } = cs;
  ctx.save();
  ctx.font = `${READABLE_CAPTION_PX}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  // Dark ink on a light halo stays legible over zone colours.
  ctx.lineJoin = 'round'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'; ctx.fillStyle = '#111827';
  // Each line is painted from its piece's centre, as drawFurnitureItem paints it outside a frame, but never turned.
  const centres = new Map(queued.map(request => [request.id, request.center ?? { x: 0, y: 0 }]));
  for (const line of placeCaptions(queued, text => ctx.measureText(text).width)) {
    const c = centres.get(line.id)!;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.strokeText(line.text, line.x - c.x, line.y - c.y); ctx.fillText(line.text, line.x - c.x, line.y - c.y);
    ctx.restore();
  }
  ctx.restore();
}
