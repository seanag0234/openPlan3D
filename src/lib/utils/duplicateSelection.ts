import type { Floor, Point, Wall } from '$lib/models/types';
import { wallPathProfile } from './wallProfiles';
import { getFurnitureSize } from './furnitureCatalog';

/** Space Duplicate leaves between the copied things and their copy, in cm. */
export const COPY_GAP = 10;

/** Where a copy kept on the same wall lands: a tenth of the wall further along
 * per step, with its centre held half its width from either end so the whole
 * opening stays on the wall; an opening wider than its wall is centred on it.
 * Widths are measured along the viewer's faceted path: a curved wall clamps by
 * its arc, not its chord. */
export function shiftedOpeningPosition(wall: Wall, opening: { position: number; width: number }, step = 1): number {
  const position = Math.max(0, Math.min(1, opening.position + .1 * step));
  const path = wallPathProfile(wall), center = path.distanceAt(position);
  const half = Math.min(path.length, opening.width > 0 ? opening.width : 0) / 2;
  if (!(path.length > 0) || !Number.isFinite(center) || (center >= half && center <= path.length - half)) return position;
  // Invert distanceAt: saved positions are curve parameters spread evenly over the spans.
  const target = Math.max(half, Math.min(path.length - half, center));
  const index = path.spans.findIndex(span => span.length > 0 && target <= span.to), span = path.spans[index];
  return (index + (target - span.from) / span.length) / path.spans.length;
}

/** Half the width a w by d footprint turned by `degrees` covers along x. */
function halfSpanX(width: number, depth: number, degrees: number): number {
  const r = (degrees || 0) * Math.PI / 180;
  return (Math.abs(width * Math.cos(r)) + Math.abs(depth * Math.sin(r))) / 2;
}

/** How far Duplicate moves a copy: right by the selection's width plus a gap, or the old 30/30 when a wall is copied or nothing copied has a size. */
export function copyShift(floor: Floor, selected: ReadonlySet<string>): Point {
  const fallback = { x: 30, y: 30 };
  if (floor.walls.some(wall => selected.has(wall.id))) return fallback;
  let left = Infinity, right = -Infinity;
  const take = (x: number, half: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(half)) return;
    left = Math.min(left, x - half); right = Math.max(right, x + half);
  };
  for (const item of floor.furniture ?? []) {
    if (!selected.has(item.id)) continue;
    const size = getFurnitureSize(item);
    take(item.position.x, halfSpanX(size.width, size.depth, item.rotation));
  }
  for (const stair of floor.stairs ?? []) if (selected.has(stair.id)) take(stair.position.x, halfSpanX(stair.width, stair.depth, stair.rotation));
  for (const column of floor.columns ?? []) if (selected.has(column.id)) take(column.position.x, column.diameter / 2);
  for (const symbol of floor.entourage ?? []) if (selected.has(symbol.id)) take(symbol.position.x, symbol.width / 2);
  if (!(right >= left)) return fallback;
  return { x: (right - left) + COPY_GAP, y: 0 };
}

/** Copy selected plan objects and openings carried by copied walls, beside the originals. Mutates floor only. */
export function duplicatePlanSelection(floor: Floor, selected: ReadonlySet<string>, uid: () => string): string[] {
  return pastePlanSelection(floor, floor, selected, uid, 1, copyShift(floor, selected));
}

/** Paste saved geometry into a destination floor without consulting live source objects; each step moves it by `shift`. */
export function pastePlanSelection(source: Floor, floor: Floor, selected: ReadonlySet<string>, uid: () => string, step = 1, shift: Point = { x: 30, y: 30 }): string[] {
  const mapping = new Map<string, string>();
  const offset = (p: Point): Point => ({ x: p.x + shift.x * step, y: p.y + shift.y * step });
  for (const wall of [...source.walls]) {
    if (!selected.has(wall.id)) continue;
    const copy = structuredClone(wall);
    copy.id = uid(); mapping.set(wall.id, copy.id);
    copy.start = offset(copy.start); copy.end = offset(copy.end);
    if (copy.curvePoint) copy.curvePoint = offset(copy.curvePoint);
    floor.walls.push(copy);
  }
  for (const key of ['doors', 'windows'] as const) {
    const items = floor[key];
    for (const item of [...source[key]]) {
      if (!selected.has(item.id) && !mapping.has(item.wallId)) continue;
      if (!mapping.has(item.wallId) && !floor.walls.some(wall => wall.id === item.wallId)) continue;
      const copy = structuredClone(item);
      copy.id = uid(); mapping.set(item.id, copy.id);
      if (mapping.has(item.wallId)) copy.wallId = mapping.get(item.wallId)!;
      else copy.position = shiftedOpeningPosition(floor.walls.find(wall => wall.id === item.wallId)!, copy, step);
      // The collection determines the opening type; preserve all original fields.
      (items as typeof copy[]).push(copy);
    }
  }
  for (const key of ['furniture', 'stairs', 'columns', 'entourage'] as const) {
    for (const item of [...source[key] ?? []]) {
      if (!selected.has(item.id)) continue;
      const copy = structuredClone(item);
      copy.id = uid(); mapping.set(item.id, copy.id);
      copy.position = offset(copy.position);
      const items = floor[key] ?? (floor[key] = []);
      (items as typeof copy[]).push(copy);
    }
  }
  for (const key of ['textAnnotations','measurements','annotations'] as const) {
    for (const item of [...source[key] ?? []]) {
      if (!selected.has(item.id)) continue;
      const copy = structuredClone(item);
      copy.id = uid(); mapping.set(item.id,copy.id);
      if ('x' in copy) { copy.x += shift.x * step; copy.y += shift.y * step; }
      else { copy.x1 += shift.x * step; copy.y1 += shift.y * step; copy.x2 += shift.x * step; copy.y2 += shift.y * step; }
      const items = floor[key] ?? (floor[key] = []);
      (items as typeof copy[]).push(copy);
    }
  }
  for (const group of [...source.groups ?? []]) {
    if (group.elementIds.length < 2 || !group.elementIds.every(id => mapping.has(id))) continue;
    (floor.groups ??= []).push({ ...structuredClone(group), id: uid(), elementIds: group.elementIds.map(id => mapping.get(id)!) });
  }
  return [...mapping.values()];
}
