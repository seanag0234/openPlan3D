import { expect, test } from '@playwright/test';
import { fingers, ipadPortrait, openPlan, recordLabels, where } from './touch';

test.use(ipadPortrait);

test('upright on a tablet the top bar says whether the plan is saved', async ({ page }) => {
  const hand = await fingers(page);
  await recordLabels(page);
  await openPlan(page, 'tests/fixtures/room-with-boxes.openplan.json');
  const sign = page.locator('[data-bar="top"] [data-save-state]');
  await expect(sign).toBeVisible();
  await expect(sign).toHaveText('Saved ✓');
  await page.keyboard.press('Escape');

  const box = await where(page, 'Box A');
  await hand.drag([box.x, box.y], [box.x + 100, box.y]);
  await expect(sign).toHaveText('Unsaved •');
  await expect(sign).toBeVisible();
  await expect(sign).toHaveText('Saved ✓', { timeout: 3000 });

  const width = page.viewportSize()!.width;
  const placed = (await sign.boundingBox())!;
  expect(placed.x).toBeGreaterThanOrEqual(0);
  expect(placed.x + placed.width).toBeLessThanOrEqual(width);
  const top = await page.locator('[data-bar="top"]').evaluate(bar => ({ scroll: bar.scrollWidth, client: bar.clientWidth }));
  expect(top.scroll).toBeLessThanOrEqual(top.client);
});
