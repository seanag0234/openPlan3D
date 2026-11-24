import type { CanvasState } from './canvasInteraction';

/** A caption the plan wants drawn: a piece's name and size, or a text label. */
export interface CaptionRequest { id: string; kind: 'piece' | 'label'; name?: string; size?: string; selected: boolean;
  /** The thing's bounds on screen. */
  box: { left: number; top: number; right: number; bottom: number } }

/** Start a frame's captions. */
export function beginCaptions(): void {}

/** True when drawCaptions will draw this caption, so the caller must not. */
export function queueCaption(request: CaptionRequest): boolean { return false; }

/** Draw the frame's queued captions. */
export function drawCaptions(cs: CanvasState): void {}
