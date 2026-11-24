import { expect, test, type Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { openPlan } from './touch';

/**
 * The room with boxes, its 200 cm measuring line, and a 300 cm dimension line with no label of its own,
 * written where the test can open it.
 */
async function planFile(path: string): Promise<string> {
  const plan = JSON.parse(await readFile('tests/fixtures/room-with-boxes.openplan.json', 'utf8'));
  plan.floors[0].annotations = [{ id: 'dim-unlabelled', x1: 50, y1: 100, x2: 350, y2: 100, offset: 40 }];
  await writeFile(path, JSON.stringify(plan));
  return path;
}

async function openList(page: Page) {
  await page.getByTitle('Everything on the plan (L)', { exact: true }).click();
  await expect(page.getByText('🗂 Everything on the plan', { exact: true })).toBeVisible();
}

const rowText = (page: Page, name: RegExp) => page.getByRole('button', { name }).innerText();

test('with metric units the list gives sizes in whole centimetres, as before', async ({ page }, testInfo) => {
  await openPlan(page, await planFile(testInfo.outputPath('list-sizes.openplan.json')));
  await openList(page);
  expect(await rowText(page, /Measurement 1 \(/)).toMatch(/Measurement 1 \(\d+ cm\)$/);
  expect(await rowText(page, /Measurement 1 \(/)).toContain('Measurement 1 (200 cm)');
  expect(await rowText(page, /Dimension line 1 \(/)).toContain('Dimension line 1 (300 cm)');
});

test('with feet and inches set the list gives sizes in feet and inches', async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem('o3d_settings', JSON.stringify({ units: 'imperial' })));
  await openPlan(page, await planFile(testInfo.outputPath('list-sizes.openplan.json')));
  await openList(page);
  const measurement = await rowText(page, /Measurement 1 \(/);
  expect(measurement).toMatch(/['"]/);
  expect(measurement).not.toContain('cm');
  expect(measurement).toContain(`Measurement 1 (6'7")`);
  const dimension = await rowText(page, /Dimension line 1 \(/);
  expect(dimension).not.toContain('cm');
  expect(dimension).toContain(`Dimension line 1 (9'10")`);
});
