import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { openPlan } from './touch';

// "Picture of the screen" saves the plan as it is drawn now, at the canvas's own size.
const FIXTURE = 'tests/fixtures/room-with-boxes.openplan.json';

test.use({ viewport: { width: 1366, height: 900 } });

test('Picture of the screen saves the plan canvas as a PNG of the same size', async ({ page }) => {
  await openPlan(page, FIXTURE);
  const canvas = page.locator('canvas[aria-label="Floor plan editor canvas"]');
  const size = await canvas.evaluate((c: HTMLCanvasElement) => ({ width: c.width, height: c.height }));
  expect(size.width).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Picture of the screen', exact: true }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(/\.png$/);
  const png = await readFile((await download.path())!);
  expect(png.subarray(1, 4).toString('ascii')).toBe('PNG');
  expect({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) }).toEqual(size);
});

test('in 3D the Export menu has no Picture of the screen', async ({ page }) => {
  await openPlan(page, FIXTURE);
  await page.getByRole('button', { name: '3D', exact: true }).click();
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Export 2D as PNG', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Picture of the screen', exact: true })).toHaveCount(0);
});
