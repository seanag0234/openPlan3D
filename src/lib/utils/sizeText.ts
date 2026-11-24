import { formatLength } from '$lib/stores/settings';

/** A short text with sizes in cm ('200×90cm', '90cm swing'), in feet and inches when units are imperial. */
export function sizeText(text: string, units: 'metric' | 'imperial'): string {
  if (units !== 'imperial') return text;
  return text.replace(/(\d+(?:\.\d+)?(?:\s*×\s*\d+(?:\.\d+)?)*)\s*cm/g,
    group => group.replace(/\s*cm$/, '').split('×').map(n => formatLength(parseFloat(n), 'imperial')).join(' × '));
}
