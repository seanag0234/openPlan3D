import { expect, test } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { openPlan } from './touch';

const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

test.use({ viewport: { width: 1440, height: 900 } });

test('a picture added to the plan goes by its own name in the list and in its details', async ({ page }, testInfo) => {
  const plan = JSON.parse(await readFile('tests/fixtures/room-with-boxes.openplan.json', 'utf8'));
  plan.customEntourage = [{ id: 'pic', name: 'Meadow', dataUrl: pixel, aspect: 1 }];
  plan.floors[0].entourage = [{ id: 'e1', defId: 'pic', position: { x: 200, y: 200 }, width: 100, rotation: 0 }];
  const file = testInfo.outputPath('symbol-name.openplan.json');
  await writeFile(file, JSON.stringify(plan));
  await openPlan(page, file);

  await page.getByTitle('Everything on the plan (L)', { exact: true }).click();
  await expect(page.getByText('🗂 Everything on the plan', { exact: true })).toBeVisible();
  const row = page.getByRole('button', { name: /^🌳\s*Meadow$/ });
  await expect(row).toBeVisible();
  await expect(page.getByRole('button', { name: /Custom 1/ })).toHaveCount(0);

  await row.click();
  const symbol = page.getByText('Symbol', { exact: true });
  await expect(symbol).toBeVisible();
  await expect(symbol.locator('xpath=following-sibling::p[1]')).toHaveText('Meadow');
  await expect(page.getByText('Custom image', { exact: true })).toHaveCount(0);
});
