import { expect, test } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { openPlan } from './touch';

/** The room with boxes, its walls moved out to a house 40 by 30 m. */
async function bigHouse(file: string): Promise<string> {
  const plan = JSON.parse(await readFile('tests/fixtures/room-with-boxes.openplan.json', 'utf8'));
  const corners = [{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 3000 }, { x: 0, y: 3000 }];
  plan.floors[0].walls.forEach((wall: any, i: number) => { wall.start = corners[i]; wall.end = corners[(i + 1) % 4]; });
  await writeFile(file, JSON.stringify(plan));
  return file;
}

test('Print Layout opens fitted to the page, ready to print a plan bigger than the page', async ({ page }, testInfo) => {
  await openPlan(page, await bigHouse(testInfo.outputPath('big.json')));
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByRole('button', { name: 'Print Layout', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Print Preview', exact: true });
  const scale = dialog.getByRole('combobox', { name: 'Scale:', exact: true });
  await expect(scale).toHaveValue('fit');
  await expect(dialog.getByRole('button', { name: 'Download PDF', exact: true })).toBeEnabled();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  // A fixed scale the plan does not fit still says so.
  await scale.selectOption('25');
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Download PDF', exact: true })).toBeDisabled();
});
