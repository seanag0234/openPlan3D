/** The text beside a ruler mark. A mark on a whole foot or metre never carries a decimal point. */
export function rulerLabel(worldCm: number, tickStep: number, isImperial: boolean): string {
  if (isImperial) {
    const inches = worldCm / 2.54;
    if (tickStep / 2.54 >= 12) {
      const ft = inches / 12, whole = Math.round(ft);
      if (Math.abs(ft - whole) < 0.01) return `${whole === 0 ? 0 : whole}'`;
      const sign = ft < 0 ? '-' : '', total = Math.round(Math.abs(inches));
      return `${sign}${Math.floor(total / 12)}' ${total % 12}"`;
    }
    return `${Math.round(inches)}"`;
  }
  if (tickStep >= 100) {
    const m = worldCm / 100, whole = Math.round(m);
    return Math.abs(m - whole) < 0.005 ? `${whole === 0 ? 0 : whole}m` : `${m.toFixed(1)}m`;
  }
  return `${Math.round(worldCm)}`;
}
