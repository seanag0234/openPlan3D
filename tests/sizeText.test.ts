import { describe, expect, it } from 'vitest';
import { sizeText } from '../src/lib/utils/sizeText';

describe('sizeText', () => {
  it('gives metric text back unchanged', () => {
    for (const text of ['200×90cm', '90cm swing', '121.9 × 121.9 × 61.0 cm', '160cm', 'Sofa'])
      expect(sizeText(text, 'metric')).toBe(text);
  });

  it('writes centimetre sizes in feet and inches when units are imperial', () => {
    expect(sizeText('200×90cm', 'imperial')).toBe(`6'7" × 2'11"`);
    expect(sizeText('90cm swing', 'imperial')).toBe(`2'11" swing`);
    expect(sizeText('121.9 × 121.9 × 61.0 cm', 'imperial')).toBe(`4' × 4' × 2'`);
    expect(sizeText('160cm', 'imperial')).toBe(`5'3"`);
  });

  it('leaves a text with no size alone', () => {
    expect(sizeText('Sliding door', 'imperial')).toBe('Sliding door');
    expect(sizeText('', 'imperial')).toBe('');
  });
});
