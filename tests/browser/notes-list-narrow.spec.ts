import { expect, test } from '@playwright/test';
import { openPlan } from './touch';

// Below 768 px the round buttons at the bottom left are hidden, but the list of notes they open is not:
// the top bar's menu can open it there too.
test('the list of notes stays on screen below 768 px', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 800 });
  await openPlan(page, 'tests/fixtures/room-with-boxes.openplan.json');
  await page.getByRole('button', { name: 'Notes', exact: true }).click();
  const list = page.getByRole('list', { name: 'Notes', exact: true });
  await expect(list).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(list).toBeVisible();
  const box = (await list.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(box.y + box.height).toBeLessThanOrEqual(844);
  for (const name of ['Keyboard Shortcuts', 'Show or hide the list of everything on the plan', 'Toggle Undo History', 'Notes']) {
    await expect(page.getByRole('button', { name, exact: true }), name).toBeHidden();
  }

  await list.getByRole('button', { name: /About this plan/ }).click();
  await expect(list).toBeHidden();
  await expect(page.getByRole('dialog', { name: 'About this plan' })).toBeVisible();
});
