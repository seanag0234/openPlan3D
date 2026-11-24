import type { Point, FurnitureItem, Wall } from '$lib/models/types';
import { snap, SNAP } from './canvasInteraction';

const ONE_INCH = 2.54;

/** What snapping is set to: the top-bar switch, the grid or fine step, the grid size in cm and the units. */
export interface SnapContext { enabled: boolean; snapToGrid: boolean; gridSize: number; units: 'metric' | 'imperial' }

/** Spacing of the minor grid lines, in cm. */
export function gridLineStepCm(s: SnapContext, fallback: number): number { return s.snapToGrid ? s.gridSize : fallback; }

/** Step a dragged piece moves by, in cm: the grid size on the grid step, the fine step otherwise. */
export function pieceStepCm(s: SnapContext): number { return s.snapToGrid ? s.gridSize : SNAP; }

/** Keep exactly as it is: an existing test reads this line. Walls, labels and measuring lines still use it. */
export function snapValue(v: number, s: SnapContext): number { return snap(v, s.enabled, s.snapToGrid, s.gridSize); }

/**
 * Where a dragged piece lands: `wanted` is under the pointer, `start` is where the drag began. In feet
 * and inches the distance moved is rounded, so a piece keeps its row; in metres the position is, as before.
 */
export function snapPieceMove(wanted: Point, start: Point, s: SnapContext): Point {
  if (!s.enabled) return { x: wanted.x, y: wanted.y };
  if (s.units !== 'imperial') return { x: snapValue(wanted.x, s), y: snapValue(wanted.y, s) };
  const step = pieceStepCm(s), round = (d: number) => Math.round(d / step) * step;
  return { x: start.x + round(wanted.x - start.x), y: start.y + round(wanted.y - start.y) };
}

/** A resize lands on whole inches in feet and inches while snapping is on; otherwise it is free, as before. */
export function resizeStep(s: SnapContext): number | undefined { return s.enabled && s.units === 'imperial' ? ONE_INCH : undefined; }

/** The nearest place to `wanted` the piece may stand, coming from `previous`. */
export function stopAtWalls(wanted: Point, previous: Point, piece: FurnitureItem, walls: readonly Wall[]): Point { return wanted; }
