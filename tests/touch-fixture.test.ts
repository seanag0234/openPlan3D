import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { readProject } from '$lib/utils/projectValidation';

describe('the room with boxes used by the touch specs', () => {
  it('opens as a valid plan, with the locked rug drawn first', () => {
    const plan = readProject(JSON.parse(readFileSync(new URL('./fixtures/room-with-boxes.openplan.json', import.meta.url), 'utf8')));
    const floor = plan.floors[0];
    expect(plan.name).toBe('Room with boxes');
    expect(floor.walls).toHaveLength(4);
    expect(floor.windows.map(item => item.wallId)).toEqual(['wall-0']);
    expect(floor.furniture.map(item => [item.name, item.locked === true])).toEqual([['Rug', true], ['Box A', false], ['Box B', false]]);
    expect(floor.textAnnotations.map(item => [item.text, item.locked])).toEqual([['Reading corner', true]]);
    expect(floor.measurements).toHaveLength(1);
  });
});
