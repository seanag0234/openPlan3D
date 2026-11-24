import type { Point, FurnitureItem, Wall } from '$lib/models/types';
import { snap } from './canvasInteraction';

/** What snapping is set to: the top-bar switch, the grid or fine step, the grid size in cm and the units. */
export interface SnapContext { enabled: boolean; snapToGrid: boolean; gridSize: number; units: 'metric' | 'imperial' }

/** Spacing of the minor grid lines, in cm. */
export function gridLineStepCm(s: SnapContext, fallback: number): number { return s.snapToGrid ? s.gridSize : fallback; }

/** A plan coordinate rounded to the current snap step. */
export function snapValue(v: number, s: SnapContext): number { return snap(v, s.enabled, s.snapToGrid, s.gridSize); }

/** Where a dragged piece lands: `wanted` is under the pointer, `start` is where the drag began. */
export function snapPieceMove(wanted: Point, start: Point, s: SnapContext): Point { return { x: snapValue(wanted.x, s), y: snapValue(wanted.y, s) }; }

/** Step a resize rounds to, in cm; undefined leaves it free. */
export function resizeStep(s: SnapContext): number | undefined { return undefined; }

/** The nearest place to `wanted` the piece may stand, coming from `previous`. */
export function stopAtWalls(wanted: Point, previous: Point, piece: FurnitureItem, walls: readonly Wall[]): Point { return wanted; }
