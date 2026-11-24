import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { labels, openPlan, recordLabels, savedPlan, where } from './touch';

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

/** Box A's centre on screen: halfway between its name line and its size line. */
async function centreOfBoxA(page: Page): Promise<{ x: number; y: number }> {
  const name = await where(page, 'Box A');
  const size = (await labels(page)).find(line => line.text.includes(' × ') && Math.abs(line.x - name.x) < 0.5 && line.y > name.y)!;
  return { x: name.x, y: (name.y + size.y) / 2 };
}

const zoomOf = async (page: Page) => Number((await page.getByText(/^Zoom: \d+%$/).innerText()).match(/\d+/)![0]) / 100;

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

test('in feet and inches an edge-handle resize lands on a whole inch', async ({ page }) => {
  await recordLabels(page);
  await openPlan(page, FIXTURE);
  await page.keyboard.press('Escape');
  const centre = await centreOfBoxA(page);
  await page.mouse.click(centre.x, centre.y);
  const zoom = await zoomOf(page);
  // Box A is 120 cm wide, so its right edge handle is 60 cm right of its centre.
  await drag(page, { x: centre.x + 60 * zoom, y: centre.y }, 37, 0, 6);
  const resized = boxA(await savedPlan(page));
  const width = 120 * resized.scale.x;
  expect(width).toBeGreaterThan(125);
  expect(width / 2.54).toBeCloseTo(Math.round(width / 2.54), 3);
  expect(resized.position.x - width / 2).toBeCloseTo(90, 2);
});
