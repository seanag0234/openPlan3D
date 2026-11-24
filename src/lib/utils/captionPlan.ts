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
 * taken first; then pieces, selected first, each keeping both lines where they are clear, else its
 * name alone there, else its name under, over, right or left of it, else its name shortened on it.
 */
export function placeCaptions(requests: readonly CaptionRequest[], measure: (text: string) => number): PlacedLine[] {
  const placed: Box[] = requests.filter(r => r.kind === 'label').map(r => r.box);
  const pieces = requests.filter(r => r.kind === 'piece');
  const ordered = [...pieces.filter(r => r.selected), ...pieces.filter(r => !r.selected)];
  const out: PlacedLine[] = [];

  for (const piece of ordered) {
    const name = piece.name ?? '', size = piece.size ?? '';
    const c = piece.center ?? { x: (piece.box.left + piece.box.right) / 2, y: (piece.box.top + piece.box.bottom) / 2 };
    const w = piece.width ?? piece.box.right - piece.box.left, d = piece.depth ?? piece.box.bottom - piece.box.top;
    const a = piece.angle ?? 0, cos = Math.abs(Math.cos(a)), sin = Math.abs(Math.sin(a));
    const bw = w * cos + d * sin, bd = w * sin + d * cos;
    const nameWidth = measure(name), tw = Math.max(nameWidth, measure(size));
    const boxOf = (line: PlacedLine): Box => {
      const half = measure(line.text) / 2;
      return { left: line.x - half, top: line.y - LINE / 2, right: line.x + half, bottom: line.y + LINE / 2 };
    };
    const clear = (lines: PlacedLine[]) => lines.every(line => !placed.some(box => overlaps(boxOf(line), box)));

    const inside = tw * cos + 2 * LINE * sin + 8 <= w && tw * sin + 2 * LINE * cos + 6 <= d;
    const nameY = inside ? c.y - LINE / 2 : c.y + bd / 2 + 4 + LINE / 2;
    const sizeY = inside ? c.y + LINE / 2 : c.y + bd / 2 + 4 + LINE * 1.5;
    const named = (x: number, y: number, text = name): PlacedLine => ({ id: piece.id, text, x, y });

    let kept: PlacedLine[] | undefined;
    const both = [named(c.x, nameY), named(c.x, sizeY, size)];
    if (clear(both)) kept = both;
    else if (clear([named(c.x, nameY)])) kept = [named(c.x, nameY)];
    else {
      const around = [
        named(c.x, c.y + bd / 2 + 4 + LINE / 2),
        named(c.x, c.y - bd / 2 - 4 - LINE / 2),
        named(c.x + bw / 2 + 4 + nameWidth / 2, c.y),
        named(c.x - bw / 2 - 4 - nameWidth / 2, c.y),
      ];
      const spot = around.find(line => clear([line]));
      if (spot) kept = [spot];
      else {
        const room = Math.max(bw, 24) - 8;
        let text = name;
        while (text.length > 1 && measure(text + '…') > room) text = text.slice(0, -1);
        kept = [named(c.x, c.y, text + '…')];
      }
    }
    for (const line of kept) { placed.push(boxOf(line)); out.push(line); }
  }
  return out;
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
  for (const line of placeCaptions(queued, text => ctx.measureText(text).width)) { ctx.strokeText(line.text, line.x, line.y); ctx.fillText(line.text, line.x, line.y); }
  ctx.restore();
}
