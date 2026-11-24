import { expect, test } from '@playwright/test';
import { openPlan, recordLabels, where } from './touch';

// Undo and Redo look switched off when there is nothing to step to, and stay pressable.
const FIXTURE = 'tests/fixtures/room-with-boxes.openplan.json';

test.use({ viewport: { width: 1366, height: 900 } });

test('Undo and Redo say when they have run out', async ({ page }) => {
  await recordLabels(page);
  await openPlan(page, FIXTURE);
  const undo = page.getByRole('button', { name: 'Undo', exact: true });
  const redo = page.getByRole('button', { name: 'Redo', exact: true });
  await expect(undo).toHaveAttribute('aria-disabled', 'true');
  await expect(redo).toHaveAttribute('aria-disabled', 'true');
  // Pressing them with nothing left is harmless: they are not disabled, only shown so.
  await expect(undo).not.toHaveAttribute('disabled');
  await undo.click({ force: true }); await redo.click({ force: true });
  await expect(undo).toHaveAttribute('aria-disabled', 'true');

  await page.keyboard.press('Escape');
  const box = await where(page, 'Box A');
  await page.mouse.move(box.x, box.y);
  await page.mouse.down();
  await page.mouse.move(box.x + 60, box.y, { steps: 8 });
  await page.mouse.move(box.x + 120, box.y, { steps: 8 });
  await page.mouse.up();
  await expect(undo).toHaveAttribute('aria-disabled', 'false');
  await expect(redo).toHaveAttribute('aria-disabled', 'true');

  await undo.click();
  await expect(undo).toHaveAttribute('aria-disabled', 'true');
  await expect(redo).toHaveAttribute('aria-disabled', 'false');

  await redo.click();
  await expect(undo).toHaveAttribute('aria-disabled', 'false');
  await expect(redo).toHaveAttribute('aria-disabled', 'true');
});
