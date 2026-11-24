import { expect, test } from '@playwright/test';
import { openPlan, recordLabels, where } from './touch';

// A second piece's details start at the top, not where the first piece's were left.
test('selecting another piece opens its details at the top', async ({ page }) => {
  await recordLabels(page);
  await openPlan(page, 'tests/fixtures/room-with-boxes.openplan.json');
  await page.keyboard.press('Escape');
  const panel = page.locator('[data-plan-properties]');
  const a = await where(page, 'Box A');
  const b = await where(page, 'Box B');
  await page.mouse.click(a.x, a.y);
  await expect(panel).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('Box A');
  await panel.evaluate(el => el.scrollTo({ top: el.scrollHeight }));
  await expect.poll(() => panel.evaluate(el => el.scrollTop)).toBeGreaterThan(100);
  await page.mouse.click(b.x, b.y);
  await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('Box B');
  await expect.poll(() => panel.evaluate(el => el.scrollTop)).toBe(0);
});
