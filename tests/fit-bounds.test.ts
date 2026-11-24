import { describe, expect, it } from 'vitest';
import { fitIds } from '$lib/utils/fitBounds';
import { roomProject } from './fixtures/project';

describe('fit bounds, as the editor does today', () => {
  it('frames the whole plan for every press', () => {
    const floor = roomProject().floors[0];
    for (const houseFixed of [false, true]) for (const everything of [false, true]) {
      expect(fitIds(floor, houseFixed, everything)).toBeUndefined();
    }
  });
});
