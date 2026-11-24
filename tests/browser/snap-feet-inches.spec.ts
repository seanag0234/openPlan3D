import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { openPlan, recordLabels, savedPlan, where } from './touch';

const FIXTURE = 'tests/fixtures/room-with-boxes.openplan.json';

/** A copy of the room with boxes, changed by `edit`, written where this test keeps its files. */
async function planWith(testInfo: TestInfo, edit: (plan: any) => void): Promise<string> {
  const plan = JSON.parse(await readFile(FIXTURE, 'utf8'));
  edit(plan);
  const file = testInfo.outputPath('plan.json');
  await writeFile(file, JSON.stringify(plan));
  return file;
}

const boxA = (plan: any) => plan.floors[0].furniture.find((item: any) => item.id === 'box-a');

async function drag(page: Page, from: { x: number; y: number }, dx: number, dy: number, steps: number) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y + dy, { steps });
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('o3d_settings', JSON.stringify({ units: 'imperial' })));
});

test('in feet and inches a piece dragged sideways keeps its row', async ({ page }, testInfo) => {
  await recordLabels(page);
  // 210 cm is no multiple of the 25 cm grid, so rounding the position would move the box off its row.
  await openPlan(page, await planWith(testInfo, plan => { boxA(plan).position = { x: 150, y: 210 }; }));
  await page.keyboard.press('Escape');
  await drag(page, await where(page, 'Box A'), 150, 0, 8);
  const moved = boxA(await savedPlan(page));
  expect(moved.position.y).toBe(210);
  expect(moved.position.x).toBeGreaterThan(150);
});
