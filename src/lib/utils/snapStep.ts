import type { TranslationKey } from '$lib/i18n';
import { formatLength, formatLengthPrecise, type ProjectSettings } from '$lib/stores/settings';
import { pieceStepCm } from '$lib/utils/snapPolicy';

/**
 * The status-bar Snap button (S) only chooses the step that snapping rounds to: the grid size, or
 * the finer step. Turning snapping off is the top-bar Snap to Grid button's job. In feet and inches
 * a whole number of inches reads without a decimal (6"), and any other step keeps a tenth of an
 * inch (25 cm reads 9.8") instead of rounding to a whole inch the plan does not snap to.
 */
export function snapStepLabel(stepCm: number, units: ProjectSettings['units']): string {
  if (units !== 'imperial') return formatLength(stepCm, units);
  const inches = stepCm / 2.54;
  return Math.abs(inches - Math.round(inches)) < 1e-6 ? formatLength(stepCm, units) : formatLengthPrecise(stepCm, units);
}

export interface SnapStatus { label: string; title: string; pressed: boolean }

/**
 * What the status-bar Snap button shows. While the top-bar Snap to Grid switch is on, it names the
 * step S picked and is pressed on the grid step. While the switch is off nothing rounds to a step,
 * so it reads "Snap off" and is not pressed; its title says S still picks the step used once the
 * switch is back on.
 */
export function snapStatus(
  t: (key: TranslationKey, variables?: Record<string, string | number>) => string,
  snapping: { enabled: boolean; snapToGrid: boolean; gridSize: number },
  units: ProjectSettings['units'],
): SnapStatus {
  const context = { ...snapping, units };
  const grid = snapStepLabel(pieceStepCm({ ...context, snapToGrid: true }), units), fine = snapStepLabel(pieceStepCm({ ...context, snapToGrid: false }), units);
  const step = snapping.snapToGrid ? grid : fine;
  return snapping.enabled
    ? { label: t('canvasDisplay.snap', { step }), title: t('canvasDisplay.snapHint', { grid, fine }), pressed: snapping.snapToGrid }
    : { label: t('canvasDisplay.snapOff'), title: t('canvasDisplay.snapOffHint', { grid, fine, step }), pressed: false };
}
