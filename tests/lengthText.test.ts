import { describe, expect, it } from 'vitest';
import { joinFeetInches, metricText, splitFeetInches } from '../src/lib/utils/lengthText';

describe('lengths as she types and reads them', () => {
  it('splits 127 cm into 4 ft 2 in and joins it back', () => {
    expect(splitFeetInches(127)).toEqual({ feet: 4, inches: 2 });
    expect(joinFeetInches(4, 2)).toBeCloseTo(127, 9);
  });
  it('rolls 11.96 in over to the next foot', () => {
    expect(splitFeetInches(30.36)).toEqual({ feet: 1, inches: 0 });
  });
  it('keeps a tenth of an inch', () => {
    expect(splitFeetInches(55.125)).toEqual({ feet: 1, inches: 9.7 });
  });
  it('reads zero as zero', () => {
    expect(splitFeetInches(0)).toEqual({ feet: 0, inches: 0 });
    expect(joinFeetInches(0, 0)).toBe(0);
  });
  it('turns 5 ft 6 in into 167.64 cm', () => {
    expect(joinFeetInches(5, 6)).toBe(167.64);
  });
  it('refuses a negative part', () => {
    expect(joinFeetInches(-1, 2)).toBeNaN();
    expect(joinFeetInches(1, -2)).toBeNaN();
  });
  it('shows centimetres as the panel always has', () => {
    expect(metricText(55.125)).toBe('55.125');
    expect(metricText(100.00004)).toBe('100');
    expect(metricText(1 / 3)).toBe('0.333');
  });
});
