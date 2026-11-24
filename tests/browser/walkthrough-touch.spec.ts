import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { fingers, ipadLandscape, openPlan } from './touch';

test.use(ipadLandscape);

const canvas = (page: Page) => page.getByRole('region', { name: '3D floor plan viewer' }).locator('canvas').last();
const pixels = async (page: Page) => createHash('sha256')
  .update(await canvas(page).evaluate((node: HTMLCanvasElement) => node.toDataURL())).digest('hex');
const middle = async (page: Page, target: ReturnType<Page['locator']>) => {
  const box = (await target.boundingBox())!;
  return [box.x + box.width / 2, box.y + box.height / 2] as [number, number];
};

test('the walk-through is steered by finger: drag to look, hold an arrow to walk, Done to leave', async ({ page }) => {
  test.slow();
  const hand = await fingers(page);
  await openPlan(page, 'tests/fixtures/room-with-boxes.openplan.json');
  await page.getByRole('button', { name: '3D', exact: true }).first().click();
  const tip = page.getByRole('button', { name: 'Got it', exact: true });
  if (await tip.isVisible()) await tip.click();
  await expect(canvas(page)).toHaveAttribute('data-rendered', 'true', { timeout: 60_000 });
  await page.getByRole('button', { name: 'Enter Walkthrough Mode', exact: true }).click();
  await expect(page.getByText('Walkthrough Controls', { exact: true })).toBeVisible();
  await expect(page.getByText(/WASD/)).toHaveCount(0);
  await expect(page.getByText('Drag to look around • Hold an arrow to walk • Done to leave', { exact: true })).toBeVisible();

  const [x, y] = await middle(page, canvas(page));
  let before = await pixels(page);
  await hand.drag([x - 100, y], [x + 100, y]);
  await expect.poll(() => pixels(page)).not.toBe(before);

  const forward = page.getByRole('button', { name: 'Walk forward', exact: true });
  await expect(forward).toBeVisible();
  before = await pixels(page);
  const [fx, fy] = await middle(page, forward);
  await hand.longPress(fx, fy, 600);
  await expect.poll(() => pixels(page)).not.toBe(before);

  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Enter Walkthrough Mode', exact: true })).toBeVisible();
});
