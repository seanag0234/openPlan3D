import { expect, test } from '@playwright/test';
import { ipadLandscape, openPlan, recordLabels, where } from './touch';

test.use(ipadLandscape);

test('tips follow what she does, never block the plan, and stay off once turned off until Help turns them on', async ({ page }) => {
  const tip = page.getByRole('region', { name: 'Getting started tip', exact: true });
  await recordLabels(page);
  await openPlan(page, 'tests/fixtures/room-with-boxes.openplan.json');

  // A new feature is announced once, with its badge.
  await expect(tip).toContainText('New');
  await expect(tip).toContainText('now has a tour');
  await expect(tip.getByRole('button', { name: 'Turn off tips' })).toHaveCount(0);
  await tip.getByRole('button', { name: 'Got it', exact: true }).tap();
  await expect(tip).toHaveCount(0);

  await page.keyboard.press('Escape');
  const box = await where(page, 'Box A');
  await page.touchscreen.tap(box.x, box.y);
  await expect(tip).toContainText('Drag it to move it.');
  // Beside the shop she touched, a finger's width clear of it.
  await expect.poll(async () => {
    const card = (await tip.boundingBox())!;
    const below = card.y - box.y, above = box.y - (card.y + card.height);
    return card.x <= box.x && box.x <= card.x + card.width && ((below >= 40 && below <= 60) || (above >= 40 && above <= 60));
  }).toBe(true);
  for (const name of ['Got it', 'Turn off tips']) expect((await tip.getByRole('button', { name, exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  // A finger on the tip's words reaches the plan under it.
  const words = (await tip.locator('p').boundingBox())!;
  expect(await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.tagName, [words.x + words.width / 2, words.y + words.height / 2])).toBe('CANVAS');

  await tip.getByRole('button', { name: 'Turn off tips', exact: true }).tap();
  await expect(tip).toHaveCount(0);
  await page.touchscreen.tap(box.x, box.y);
  await page.waitForTimeout(500);
  await expect(tip).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole('button', { name: 'Help', exact: true })).toBeVisible();
  await page.waitForTimeout(1000);
  await expect(tip).toHaveCount(0);

  await page.getByRole('button', { name: 'Help', exact: true }).tap();
  const help = page.getByRole('dialog', { name: 'Using your fingers', exact: true });
  const switchTips = help.getByRole('checkbox', { name: 'Show tips as I go' });
  await expect(switchTips).not.toBeChecked();
  await switchTips.tap();
  await help.getByRole('button', { name: 'Done', exact: true }).tap();
  const again = await where(page, 'Box A');
  await page.touchscreen.tap(again.x, again.y);
  await expect(tip).toContainText('Drag it to move it.');
  expect(await page.evaluate(() => localStorage.getItem('o3d_tips_off'))).toBeNull();
});
