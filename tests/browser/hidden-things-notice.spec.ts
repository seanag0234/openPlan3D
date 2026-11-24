import { expect, test, type Page } from '@playwright/test';
import { ipadLandscape, ipadPortrait, labels, openPlan, recordLabels } from './touch';

const PLAN = 'tests/fixtures/room-with-boxes.openplan.json';

async function drawn(page: Page, text: string): Promise<boolean> {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  return (await labels(page)).some(label => label.text === text);
}

async function expectNoticeBringsThingsBack(page: Page) {
  const notice = page.getByRole('status').filter({ hasText: 'Some things are hidden' });
  await expect(notice).toBeVisible();
  await expect.poll(() => drawn(page, 'Box A')).toBe(false);
  await notice.getByRole('button', { name: 'Show all', exact: true }).click();
  await expect(notice).toHaveCount(0);
  await expect.poll(() => drawn(page, 'Box A')).toBe(true);
  await expect.poll(() => drawn(page, 'Box B')).toBe(true);
}

test('with a mouse, hiding furniture from the bottom bar says so and Show all brings it back', async ({ page }) => {
  await recordLabels(page);
  await openPlan(page, PLAN);
  await expect.poll(() => drawn(page, 'Box A')).toBe(true);
  await expect(page.getByText('Some things are hidden', { exact: true })).toHaveCount(0);
  await page.locator('[data-bar="bottom"]').getByTitle('Toggle Furniture', { exact: true }).click();
  await expectNoticeBringsThingsBack(page);
});

test('the popup is called Show and hide', async ({ page }) => {
  await openPlan(page, PLAN);
  await page.locator('[data-bar="bottom"]').getByRole('button', { name: '🗂 Show and hide', exact: true }).click();
  await expect(page.getByText('Show and hide', { exact: true })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Walls', exact: true })).toBeChecked();
});

for (const [name, device] of [['iPad landscape', ipadLandscape], ['iPad portrait', ipadPortrait]] as const) test.describe(name, () => {
  test.use(device);

  test('the popup\'s Furniture tick box hides the pieces, and Show all brings them back', async ({ page }) => {
    await recordLabels(page);
    await openPlan(page, PLAN);
    const bar = page.locator('[data-bar="bottom"]');
    await expect(bar.getByTitle('Toggle Furniture', { exact: true })).toHaveCount(0);
    await bar.getByRole('button', { name: '🗂 Show and hide', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Furniture', exact: true }).click();
    await bar.getByRole('button', { name: '🗂 Show and hide', exact: true }).click();
    // The notice sits clear of the zoom buttons, so nothing covers Show all.
    const notice = (await page.getByRole('status').filter({ hasText: 'Some things are hidden' }).boundingBox())!;
    const zoom = (await page.locator('[data-bar="zoom"]').boundingBox())!;
    expect(notice.y + notice.height <= zoom.y || notice.x >= zoom.x + zoom.width).toBe(true);
    await expectNoticeBringsThingsBack(page);
  });
});
