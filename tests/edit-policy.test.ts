import { describe, expect, it } from 'vitest';
import { createDefaultProject } from '$lib/stores/project';
import { allLocked, canDelete, canDeleteItem, interactiveFloor, isLocked, lockableItems, unlockedOnly } from '$lib/utils/editPolicy';
import type { Floor } from '$lib/models/types';

function plan(): Floor {
  const floor = createDefaultProject().floors[0];
  floor.walls = [{ id: 'w', start: { x: 0, y: 0 }, end: { x: 400, y: 0 }, thickness: 15, height: 250, color: '#ccc' }];
  floor.doors = [{ id: 'd', wallId: 'w', position: 0.3, width: 80, height: 200, type: 'single', swingDirection: 'left', flipSide: false }];
  floor.windows = [{ id: 'win', wallId: 'w', position: 0.7, width: 100, height: 120, sillHeight: 90, type: 'standard' }];
  floor.furniture = [
    { id: 'locked-box', catalogId: 'imported_object', position: { x: 100, y: 100 }, rotation: 0, scale: { x: 1, y: 1, z: 1 }, locked: true },
    { id: 'free-box', catalogId: 'imported_object', position: { x: 300, y: 100 }, rotation: 0, scale: { x: 1, y: 1, z: 1 } },
  ];
  floor.entourage = [{ id: 'symbol', defId: 'person', position: { x: 200, y: 200 }, rotation: 0, width: 50, locked: true }];
  floor.textAnnotations = [{ id: 'label', x: 200, y: 50, text: 'Hall', fontSize: 16, color: '#111', rotation: 0, locked: true }];
  return floor;
}

describe('edit policy', () => {
  it('lists every piece, symbol and text label as lockable', () => {
    expect(lockableItems(plan()).map(item => item.id)).toEqual(['locked-box', 'free-box', 'symbol', 'label']);
  });

  it('knows which items are locked', () => {
    const floor = plan();
    expect(['locked-box', 'free-box', 'symbol', 'label', 'w', 'nothing'].map(id => isLocked(floor, id)))
      .toEqual([true, false, true, true, false, false]);
  });

  it('calls a selection locked only when every item in it is', () => {
    const floor = plan();
    expect(allLocked(floor, ['locked-box', 'symbol', 'label'])).toBe(true);
    expect(allLocked(floor, new Set(['locked-box', 'free-box']))).toBe(false);
    expect(allLocked(floor, ['locked-box', 'w'])).toBe(false);
    expect(allLocked(floor, [])).toBe(false);
  });

  it('allows a delete unless everything chosen is locked', () => {
    const floor = plan();
    expect(canDelete(floor, ['locked-box', 'symbol'])).toBe(false);
    expect(canDelete(floor, ['locked-box', 'free-box'])).toBe(true);
    expect(canDelete(floor, [])).toBe(true);
    expect(canDeleteItem(floor.furniture[0])).toBe(false);
    expect(canDeleteItem(floor.furniture[1])).toBe(true);
    expect(canDeleteItem(floor.entourage![0])).toBe(false);
    expect(canDeleteItem(null)).toBe(true);
    expect(canDeleteItem(undefined)).toBe(true);
  });

  it('leaves the locked items out of the floor a plain press sees', () => {
    const floor = plan(), seen = unlockedOnly(floor);
    expect(seen.furniture.map(item => item.id)).toEqual(['free-box']);
    expect(seen.entourage).toEqual([]);
    expect(seen.textAnnotations).toEqual([]);
    expect(seen.walls).toBe(floor.walls);
    expect(floor.furniture).toHaveLength(2);
    const bare = { ...floor, entourage: undefined };
    expect(unlockedOnly(bare).entourage).toBeUndefined();
  });

  it('leaves the house out too when it is fixed', () => {
    const floor = plan();
    expect(interactiveFloor(floor, false)).toEqual(unlockedOnly(floor));
    const fixed = interactiveFloor(floor, true);
    expect(fixed.walls).toEqual([]);
    expect(fixed.doors).toEqual([]);
    expect(fixed.windows).toEqual([]);
    expect(fixed.furniture.map(item => item.id)).toEqual(['free-box']);
  });
});
