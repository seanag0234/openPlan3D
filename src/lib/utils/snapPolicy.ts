import { get } from 'svelte/store';
import type { Point, FurnitureItem, Wall } from '$lib/models/types';
import { houseFixed } from '$lib/stores/project';
import { getFurnitureSize } from './furnitureCatalog';
import { snap, SNAP } from './canvasInteraction';

const ONE_INCH = 2.54, SIX_INCHES = 15.24, ONE_FOOT = 30.48;

/** What snapping is set to: the top-bar switch, the grid or fine step, the grid size in cm and the units. */
export interface SnapContext { enabled: boolean; snapToGrid: boolean; gridSize: number; units: 'metric' | 'imperial' }

/** Spacing of the minor grid lines, in cm: every foot in feet and inches; the snap step or `fallback` in metres. */
export function gridLineStepCm(s: SnapContext, fallback: number): number {
  if (s.units === 'imperial') return ONE_FOOT;
  return s.snapToGrid ? s.gridSize : fallback;
}

/** Spacing of the heavier grid lines, in cm: every metre, or every 3 ft. */
export function gridMajorStepCm(s: SnapContext): number { return s.units === 'imperial' ? 3 * ONE_FOOT : 100; }

/** Step a dragged piece moves by, in cm: 6 in on the grid step and 1 in off it in feet and inches; the grid size or 10 cm in metres. */
export function pieceStepCm(s: SnapContext): number {
  if (s.units === 'imperial') return s.snapToGrid ? SIX_INCHES : ONE_INCH;
  return s.snapToGrid ? s.gridSize : SNAP;
}

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

/** Half sizes of the upright box around the piece, turned or not, in cm. */
function halfBox(piece: FurnitureItem): { hx: number; hy: number } {
  const { width, depth } = getFurnitureSize(piece), r = (piece.rotation || 0) * Math.PI / 180;
  return { hx: (Math.abs(width * Math.cos(r)) + Math.abs(depth * Math.sin(r))) / 2, hy: (Math.abs(width * Math.sin(r)) + Math.abs(depth * Math.cos(r))) / 2 };
}

/** True when the upright box centred at c overlaps the straight wall's band. Touching is not overlapping. */
function overlapsWall(c: Point, hx: number, hy: number, wall: Wall): boolean {
  const dx = wall.end.x - wall.start.x, dy = wall.end.y - wall.start.y, len = Math.hypot(dx, dy);
  if (len < 1e-6 || wall.curvePoint) return false;
  const ux = dx / len, uy = dy / len, hl = len / 2, ht = wall.thickness / 2, EPS = 0.01;
  const mx = (wall.start.x + wall.end.x) / 2 - c.x, my = (wall.start.y + wall.end.y) / 2 - c.y;
  if (Math.abs(mx) >= hx + hl * Math.abs(ux) + ht * Math.abs(uy) - EPS) return false;
  if (Math.abs(my) >= hy + hl * Math.abs(uy) + ht * Math.abs(ux) - EPS) return false;
  if (Math.abs(mx * ux + my * uy) >= hl + hx * Math.abs(ux) + hy * Math.abs(uy) - EPS) return false;
  if (Math.abs(my * ux - mx * uy) >= ht + hx * Math.abs(uy) + hy * Math.abs(ux) - EPS) return false;
  return true;
}

/** The farthest point from `from` towards `to` the box reaches before `hits`; `to` itself when the way is free. */
function advance(from: Point, to: Point, hits: (p: Point) => boolean): Point {
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  if (dist < 1e-6) return to;
  const n = Math.ceil(dist / 5), at = (t: number) => ({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
  let free = 0;
  for (let i = 1; i <= n; i++) { if (hits(at(i / n))) break; free = i / n; }
  if (free === 1) return to;
  let lo = free, hi = Math.min(1, free + 1 / n);
  for (let k = 0; k < 6; k++) { const mid = (lo + hi) / 2; if (hits(at(mid))) hi = mid; else lo = mid; }
  return at(lo);
}

/** Where the piece ends up going from `previous` towards `wanted`: it stops at a wall's face and slides along it. A piece already in a wall is let out. */
export function slideAlongWalls(wanted: Point, previous: Point, piece: FurnitureItem, walls: readonly Wall[]): Point {
  const { hx, hy } = halfBox(piece), hits = (p: Point) => walls.some(w => overlapsWall(p, hx, hy, w));
  if (hits(previous)) return wanted;
  const stop = advance(previous, wanted, hits);
  if (stop === wanted) return wanted;
  const alongX = advance(stop, { x: wanted.x, y: stop.y }, hits), alongY = advance(stop, { x: stop.x, y: wanted.y }, hits);
  const gain = (p: Point) => Math.hypot(p.x - stop.x, p.y - stop.y);
  return gain(alongX) >= gain(alongY) ? alongX : alongY;
}

/** The nearest place to `wanted` the piece may stand, coming from `previous`: walls stop it only while the house is fixed. */
export function stopAtWalls(wanted: Point, previous: Point, piece: FurnitureItem, walls: readonly Wall[]): Point {
  return get(houseFixed) ? slideAlongWalls(wanted, previous, piece, walls) : wanted;
}
