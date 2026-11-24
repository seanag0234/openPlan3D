import { describe, expect, it } from 'vitest';
import { shiftToReveal } from '$lib/utils/viewShift';

const view = { width: 1000, height: 800 };
const sheet = { right: 300, bottom: 0 };   // free area: x 24..676, y 24..776

describe('sliding the plan so the selection clears an open sheet', () => {
  it('leaves a box that is already in the free area where it is', () => {
    expect(shiftToReveal({ left: 100, top: 100, right: 300, bottom: 300 }, view, sheet)).toEqual({ dx: 0, dy: 0 });
    expect(shiftToReveal({ left: 24, top: 24, right: 676, bottom: 776 }, view, sheet)).toEqual({ dx: 0, dy: 0 });
  });

  it('slides a box under the sheet on the right left by the least distance', () => {
    expect(shiftToReveal({ left: 600, top: 100, right: 800, bottom: 200 }, view, sheet)).toEqual({ dx: -124, dy: 0 });
  });

  it('slides a box off the left edge right by the least distance', () => {
    expect(shiftToReveal({ left: -40, top: 100, right: 60, bottom: 200 }, view, sheet)).toEqual({ dx: 64, dy: 0 });
  });

  it('slides a box under a sheet at the bottom up', () => {
    const bottomSheet = { right: 0, bottom: 400 };   // free y 24..376
    expect(shiftToReveal({ left: 100, top: 350, right: 200, bottom: 450 }, view, bottomSheet)).toEqual({ dx: 0, dy: -74 });
    expect(shiftToReveal({ left: 900, top: 700, right: 1100, bottom: 760 }, view, bottomSheet, 0)).toEqual({ dx: -100, dy: -360 });
  });

  it('lines up a box wider or taller than the free area with its left or top edge', () => {
    expect(shiftToReveal({ left: 200, top: 100, right: 1000, bottom: 200 }, view, sheet)).toEqual({ dx: -176, dy: 0 });
    expect(shiftToReveal({ left: -500, top: -100, right: 2000, bottom: 1000 }, view, sheet)).toEqual({ dx: 524, dy: 124 });
  });

  it('uses the margin it is given', () => {
    expect(shiftToReveal({ left: 5, top: 5, right: 50, bottom: 50 }, view, { right: 0, bottom: 0 }, 10)).toEqual({ dx: 5, dy: 5 });
    expect(shiftToReveal({ left: 5, top: 5, right: 50, bottom: 50 }, view, { right: 0, bottom: 0 }, 0)).toEqual({ dx: 0, dy: 0 });
  });
});
