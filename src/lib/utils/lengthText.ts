const CM_PER_INCH = 2.54;

/** A length in whole feet and inches to a tenth; 11.96 in rolls over to the next foot. */
export function splitFeetInches(cm: number): { feet: number; inches: number } {
  const total = Math.abs(cm) / CM_PER_INCH;
  let feet = Math.floor(total / 12);
  let inches = Math.round((total - feet * 12) * 10) / 10;
  if (inches >= 12) { feet += 1; inches = 0; }
  return cm < 0 ? { feet: -feet, inches: inches && -inches } : { feet, inches };
}

/** Feet and inches back to centimetres; NaN when either part is negative. */
export function joinFeetInches(feet: number, inches: number): number {
  if (!(feet >= 0) || !(inches >= 0)) return NaN;
  return Math.round((feet * 12 + inches) * CM_PER_INCH * 1e6) / 1e6;
}

/** Centimetres as the panel shows them: up to three decimals. */
export function metricText(cm: number): string {
  return String(Math.round(cm * 1000) / 1000);
}
