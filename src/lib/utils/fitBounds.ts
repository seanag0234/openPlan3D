import type { Floor } from '$lib/models/types';

/**
 * The ids "Fit" should frame; undefined means the whole plan. `everything` is a second press soon
 * after the first. While the house is fixed the pieces are what is moved, so Fit frames them, locked
 * ones included; a second press frames everything.
 */
export function fitIds(floor: Floor, houseFixed: boolean, everything: boolean): ReadonlySet<string> | undefined {
  if (!houseFixed || everything || !floor.furniture.length) return undefined;
  return new Set(floor.furniture.map(item => item.id));
}
