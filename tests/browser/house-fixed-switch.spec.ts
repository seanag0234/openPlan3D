import { expect, test } from '@playwright/test';
import { openPlan, savedPlan } from './touch';

test('the bottom bar switches the house between fixed and free, as one undo step', async ({ page }) => {
  await openPlan(page, 'tests/fixtures/room-with-boxes.openplan.json');
  const bar = page.locator('[data-bar="bottom"]');
  const free = bar.getByRole('button', { name: '🏠 House: can move', exact: true });
  await expect(free).toHaveAttribute('aria-pressed', 'false');
  await expect(free).toHaveAttribute('title', 'Walls, doors, windows and rooms stay put while the house is fixed');
  expect((await savedPlan(page)).houseFixed).toBeUndefined();
  await page.keyboard.press('Escape');

  await free.click();
  const fixed = bar.getByRole('button', { name: '🏠 House: fixed', exact: true });
  await expect(fixed).toHaveAttribute('aria-pressed', 'true');
  expect((await savedPlan(page)).houseFixed).toBe(true);
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(free).toHaveAttribute('aria-pressed', 'false');
  expect((await savedPlan(page)).houseFixed).toBeUndefined();
});

test('the switch comes first in the bar and reads in Portuguese', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('o3d_locale', 'pt'));
  await page.goto('/editor');
  const first = page.locator('[data-bar="bottom"] > *').first();
  await expect(first).toHaveText('🏠 Casa: pode mover');
  await first.click();
  await expect(first).toHaveText('🏠 Casa: fixa');
});
