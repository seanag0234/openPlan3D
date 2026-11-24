import { afterEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

const load = () => import('../src/lib/stores/pointer');

describe('pointer stores', () => {
  it('follow the media query when the window has one', async () => {
    const queries: string[] = [];
    vi.stubGlobal('window', {
      matchMedia: (query: string) => {
        queries.push(query);
        return { matches: true, addEventListener() {}, removeEventListener() {} };
      },
    });
    const { coarsePointer, canHover } = await load();
    expect(get(coarsePointer)).toBe(true);
    expect(get(canHover)).toBe(true);
    expect(queries).toEqual(['(pointer: coarse)', '(hover: hover)']);
  });

  it('change when the query does', async () => {
    let listener = () => {};
    const list = { matches: false, addEventListener: (_: string, on: () => void) => { listener = on; }, removeEventListener() {} };
    vi.stubGlobal('window', { matchMedia: () => list });
    const { coarsePointer } = await load();
    const seen: boolean[] = [];
    const stop = coarsePointer.subscribe(value => seen.push(value));
    list.matches = true;
    listener();
    stop();
    expect(seen).toEqual([false, true]);
  });

  it('give their fallback without a window', async () => {
    vi.stubGlobal('window', undefined);
    const { coarsePointer, canHover } = await load();
    expect(get(coarsePointer)).toBe(false);
    expect(get(canHover)).toBe(true);
  });
});
