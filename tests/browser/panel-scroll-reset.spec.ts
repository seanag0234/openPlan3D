import { expect, test } from '@playwright/test';
import { fingers, ipadLandscape, openPlan, recordLabels, where } from './touch';

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

test.describe('on a touch screen', () => {
  test.use(ipadLandscape);

  // The sheet is hidden between Done and the next Details, so it is put back at the top as it opens.
  test('the next piece\'s details sheet opens at the top', async ({ page }) => {
    const hand = await fingers(page);
    await recordLabels(page);
    await openPlan(page, 'tests/fixtures/room-with-boxes.openplan.json');
    await page.keyboard.press('Escape');
    const panel = page.locator('[data-plan-properties]');
    const a = await where(page, 'Box A');
    const details = page.getByRole('button', { name: 'Details', exact: true });
    await hand.tap(a.x, a.y - 24);
    await details.tap();
    await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('Box A');
    await panel.evaluate(el => el.scrollTo({ top: el.scrollHeight }));
    await expect.poll(() => panel.evaluate(el => el.scrollTop)).toBeGreaterThan(100);
    await panel.getByRole('button', { name: 'Done', exact: true }).tap();
    await expect(panel).toBeHidden();
    // Opening the sheet may have moved the plan to keep Box A in view.
    const b = await where(page, 'Box B');
    await hand.tap(b.x, b.y - 24);
    await details.tap();
    await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('Box B');
    await expect.poll(() => panel.evaluate(el => el.scrollTop)).toBe(0);
  });
});
