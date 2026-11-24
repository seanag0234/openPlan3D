/** A rectangle on screen, in px. */
export interface ScreenBox { left: number; top: number; right: number; bottom: number }

const MARGIN = 8;

/**
 * Where the bar over a selection goes: centred on it and above it, clear of its handles by `clearance`;
 * below it when there is no room above; at the top edge when there is room neither way. Always on screen.
 */
export function toolbarPosition(box: ScreenBox, bar: { width: number; height: number }, view: { width: number; height: number },
  clearance: { above: number; below: number }, gap = 8): { left: number; top: number } {
  const centred = (box.left + box.right) / 2 - bar.width / 2;
  const left = Math.max(MARGIN, Math.min(centred, view.width - bar.width - MARGIN));
  let top = box.top - clearance.above - gap - bar.height;
  if (top < MARGIN) {
    top = box.bottom + clearance.below + gap;
    if (top > view.height - bar.height - MARGIN) top = MARGIN;
  }
  return { left, top };
}
