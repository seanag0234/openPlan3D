/** A rectangle on screen, in px. */
export interface ScreenBox { left: number; top: number; right: number; bottom: number }

const MARGIN = 8;

/**
 * Where the bar over a selection goes: centred on it and above it, clear of its handles by `clearance`;
 * below it when there is no room above; at the top edge when there is room neither way. Always on screen.
 * With `prefer` 'below' it tries below first, then above, then the top edge.
 */
export function toolbarPosition(box: ScreenBox, bar: { width: number; height: number }, view: { width: number; height: number },
  clearance: { above: number; below: number }, gap = 8, prefer: 'above' | 'below' = 'above'): { left: number; top: number } {
  const centred = (box.left + box.right) / 2 - bar.width / 2;
  const left = Math.max(MARGIN, Math.min(centred, view.width - bar.width - MARGIN));
  const above = box.top - clearance.above - gap - bar.height;
  const below = box.bottom + clearance.below + gap;
  const fitsAbove = above >= MARGIN, fitsBelow = below <= view.height - bar.height - MARGIN;
  let top: number;
  if (prefer === 'below') top = fitsBelow ? below : fitsAbove ? above : MARGIN;
  else top = fitsAbove ? above : fitsBelow ? below : MARGIN;
  return { left, top };
}
