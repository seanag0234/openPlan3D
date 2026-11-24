import { describe, expect, it } from 'vitest';
import { rulerLabel } from '$lib/utils/rulerLabel';

describe('rulerLabel', () => {
  it('writes a whole foot without a decimal point even when the mark arrives slightly off', () => {
    expect(rulerLabel(152.39999, 152.4, true)).toBe(`5'`);
    expect(rulerLabel(-762.0000001, 152.4, true)).toBe(`-25'`);
  });

  it('writes feet and inches between whole feet, and inches on a fine ruler', () => {
    expect(rulerLabel(45.72, 30.48, true)).toBe(`1' 6"`);
    expect(rulerLabel(15.24, 15.24, true)).toBe(`6"`);
  });

  it('writes whole metres without a decimal point and half metres with one', () => {
    expect(rulerLabel(499.99999, 100, false)).toBe('5m');
    expect(rulerLabel(250, 100, false)).toBe('2.5m');
    expect(rulerLabel(50, 50, false)).toBe('50');
  });

  it('never writes a decimal point on a whole foot reached by adding small steps', () => {
    let wx = -1219.2;
    for (let i = 0; i <= 960; i++) {
      if (i % 6 === 0) {
        const label = rulerLabel(wx, 152.4, true);
        expect(label, `mark ${i / 6 - 40} ft`).not.toContain('.');
        expect(label).toMatch(/^-?\d+'$/);
      }
      wx += 5.08;
    }
  });
});
