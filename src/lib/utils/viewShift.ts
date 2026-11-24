/** The least move along one axis that brings [start, end] inside [low, high]; too long a span lines up with `low`. */
function axisShift(start: number, end: number, low: number, high: number): number {
  if (end - start > high - low) return low - start + 0;
  if (start < low) return low - start;
  if (end > high) return high - end;
  return 0;
}

/** How far, in screen px, the plan must slide so `box` is clear of the covered right and bottom edges. */
export function shiftToReveal(box: { left: number; top: number; right: number; bottom: number }, view: { width: number; height: number },
  obstruction: { right: number; bottom: number }, margin = 24): { dx: number; dy: number } {
  return {
    dx: axisShift(box.left, box.right, margin, view.width - obstruction.right - margin),
    dy: axisShift(box.top, box.bottom, margin, view.height - obstruction.bottom - margin),
  };
}
