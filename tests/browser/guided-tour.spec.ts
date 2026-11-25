import { expect, test } from '@playwright/test';
import { ipadLandscape, openPlan } from './touch';

test.use(ipadLandscape);

test('the tour starts from Help, goes forward and back, and rings the control each step is about', async ({ page }) => {
  await openPlan(page, 'tests/fixtures/room-with-boxes.openplan.json');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Help', exact: true }).tap();
  await page.getByRole('dialog', { name: 'Using your fingers', exact: true }).getByRole('button', { name: 'Take the tour' }).tap();

  const tour = page.getByRole('dialog', { name: 'Take the tour' });
  const ring = page.getByTestId('tour-ring');
  await expect(tour).toContainText('Step 1 of 10');
  await expect(tour.getByRole('heading')).toHaveText('Your town, ready to plan');
  await expect(tour.getByRole('button', { name: /Back/ })).toBeDisabled();
  await expect(ring).toHaveCount(0);

  for (let step = 2; step <= 4; step++) await tour.getByRole('button', { name: /Next/ }).tap();
  await expect(tour).toContainText('Step 4 of 10');
  await expect(tour.getByRole('heading')).toHaveText('Changed your mind? Undo');
  const undo = (await page.locator('[data-tour="undo"]').boundingBox())!;
  const around = (await ring.boundingBox())!;
  expect(around.x).toBeLessThan(undo.x);
  expect(around.y).toBeLessThan(undo.y);
  expect(around.x + around.width).toBeGreaterThan(undo.x + undo.width);
  expect(around.y + around.height).toBeGreaterThan(undo.y + undo.height);

  await tour.getByRole('button', { name: /Back/ }).tap();
  await expect(tour).toContainText('Step 3 of 10');
  await expect(ring).toHaveCount(0);

  for (let step = 4; step <= 10; step++) await tour.getByRole('button', { name: /Next/ }).tap();
  await expect(tour.getByRole('heading')).toHaveText("Tell Sean what's wrong");
  await expect(ring).toBeVisible();
  for (const name of [/Back/, 'Done']) expect((await tour.getByRole('button', { name }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await tour.getByRole('button', { name: 'Done' }).tap();
  await expect(tour).toHaveCount(0);
});
