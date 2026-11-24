import { describe, expect, it } from 'vitest';
import { toolbarPosition } from '$lib/utils/toolbarPlacement';

const bar = { width: 200, height: 40 };
const view = { width: 1000, height: 700 };
const clearance = { above: 30, below: 10 };

describe('where the bar over a selection goes', () => {
  it('sits above the selection, clear of its handles, when there is room', () => {
    expect(toolbarPosition({ left: 400, top: 300, right: 600, bottom: 400 }, bar, view, clearance))
      .toEqual({ left: 400, top: 300 - 30 - 8 - 40 });
  });
  it('goes below when there is no room above', () => {
    expect(toolbarPosition({ left: 400, top: 50, right: 600, bottom: 200 }, bar, view, clearance))
      .toEqual({ left: 400, top: 200 + 10 + 8 });
  });
  it('keeps to the top edge when there is room neither above nor below', () => {
    expect(toolbarPosition({ left: 400, top: 20, right: 600, bottom: 680 }, bar, view, clearance))
      .toEqual({ left: 400, top: 8 });
  });
  it('stays on screen for a selection at the left edge', () => {
    expect(toolbarPosition({ left: -50, top: 300, right: 50, bottom: 400 }, bar, view, clearance).left).toBe(8);
    expect(toolbarPosition({ left: 950, top: 300, right: 1100, bottom: 400 }, bar, view, clearance).left).toBe(1000 - 200 - 8);
  });
  it('takes a gap of its own', () => {
    expect(toolbarPosition({ left: 400, top: 300, right: 600, bottom: 400 }, bar, view, { above: 12, below: 12 }, 0).top).toBe(300 - 12 - 40);
  });
});
