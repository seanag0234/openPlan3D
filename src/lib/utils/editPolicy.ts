import type { Floor } from '$lib/models/types';

/** The lists whose items can be locked: pieces, symbols and text labels. */
const LOCKABLE = ['furniture', 'entourage', 'textAnnotations'] as const;

/** Every piece, symbol and text label on the floor, locked or not. */
export function lockableItems(floor: Floor): { id: string; locked?: boolean }[] {
  const items: { id: string; locked?: boolean }[] = [];
  for (const key of LOCKABLE) items.push(...floor[key] ?? []);
  return items;
}

/** A locked item stays where it is and cannot be deleted. */
export function isLocked(floor: Floor, id: string): boolean {
  return lockableItems(floor).some(item => item.id === id && item.locked === true);
}

/** Every id names a locked item; false for no ids. */
export function allLocked(floor: Floor, ids: Iterable<string>): boolean {
  const list = [...ids];
  if (!list.length) return false;
  const locked = new Set(lockableItems(floor).filter(item => item.locked).map(item => item.id));
  return list.every(id => locked.has(id));
}

/** Delete would remove something: not every chosen item is locked. */
export function canDelete(floor: Floor, ids: Iterable<string>): boolean {
  return !allLocked(floor, ids);
}

/** The one item may be deleted. */
export function canDeleteItem(item: { locked?: boolean } | null | undefined): boolean {
  return !item?.locked;
}

/** The floor without its locked pieces, symbols and text labels: what a plain press can pick. */
export function unlockedOnly(floor: Floor): Floor {
  const seen: Floor = { ...floor };
  for (const key of LOCKABLE) {
    const items = floor[key] as { locked?: boolean }[] | undefined;
    if (items) (seen as unknown as Record<string, unknown>)[key] = items.filter(item => !item.locked);
  }
  return seen;
}

/** What a plain press can pick; with the house fixed, walls, doors and windows are left out too. */
export function interactiveFloor(floor: Floor, houseFixed: boolean): Floor {
  const seen = unlockedOnly(floor);
  return houseFixed ? { ...seen, walls: [], doors: [], windows: [] } : seen;
}
