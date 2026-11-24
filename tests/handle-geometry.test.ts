import { describe, expect, it } from 'vitest';
import { COARSE_HANDLE, FINE_HANDLE, handleGeometry } from '$lib/utils/handleGeometry';

describe('handle geometry', () => {
  it('keeps mouse handles on the corner and small', () => {
    expect(FINE_HANDLE).toEqual({ outset: 0, radius: 5, reach: 8 });
    expect(handleGeometry(false)).toBe(FINE_HANDLE);
    expect(handleGeometry(undefined)).toBe(FINE_HANDLE);
  });

  it('gives a finger handles outside the corner with a wider reach', () => {
    expect(COARSE_HANDLE).toEqual({ outset: 10, radius: 9, reach: 28 });
    expect(handleGeometry(true)).toBe(COARSE_HANDLE);
    expect(COARSE_HANDLE.reach).toBeGreaterThan(COARSE_HANDLE.radius);
  });
});
