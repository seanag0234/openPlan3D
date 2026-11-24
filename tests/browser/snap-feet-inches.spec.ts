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

test.describe('in feet and inches', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('o3d_settings', JSON.stringify({ units: 'imperial' })));
  });

  test('a piece dragged sideways keeps its row', async ({ page }, testInfo) => {
    await recordLabels(page);
    // 210 cm is no multiple of the 25 cm grid, so rounding the position would move the box off its row.
    await openPlan(page, await planWith(testInfo, plan => { boxA(plan).position = { x: 150, y: 210 }; }));
    await page.keyboard.press('Escape');
    await drag(page, await where(page, 'Box A'), 150, 0, 8);
    const moved = boxA(await savedPlan(page));
    expect(moved.position.y).toBe(210);
    expect(moved.position.x).toBeGreaterThan(150);
    // On the grid a piece moves in 6 in steps.
    const steps = (moved.position.x - 150) / 15.24;
    expect(steps).toBeCloseTo(Math.round(steps), 3);
  });

  test('an edge-handle resize lands on a whole inch', async ({ page }) => {
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
});

test.describe('walls', () => {
  /** Box A's saved left edge, and the inner face of the room's left wall. */
  function leftEdges(plan: any) {
    const box = boxA(plan), r = (box.rotation || 0) * Math.PI / 180;
    const walls = plan.floors[0].walls as any[];
    const left = walls.reduce((a, b) => Math.max(b.start.x, b.end.x) < Math.max(a.start.x, a.end.x) ? b : a);
    const halfWide = (Math.abs(120 * box.scale.x * Math.cos(r)) + Math.abs(90 * box.scale.y * Math.sin(r))) / 2;
    return { box: box.position.x - halfWide, face: left.start.x + left.thickness / 2 };
  }

  test('stop a piece while the house is fixed', async ({ page }, testInfo) => {
    await recordLabels(page);
    // Snap to walls would catch the box on the wall's far face and carry it outside; that path is the
    // plan canvas's, so this test holds what a plain drag does.
    await page.addInitScript(() => localStorage.setItem('o3d_settings', JSON.stringify({ snapToWalls: false })));
    await openPlan(page, await planWith(testInfo, plan => { plan.houseFixed = true; }));
    await page.keyboard.press('Escape');
    await drag(page, await where(page, 'Box A'), -400, 0, 10);
    const { box, face } = leftEdges(await savedPlan(page));
    expect(box).toBeGreaterThanOrEqual(face - 0.5);
  });

  test('stop a piece while the house is fixed and Snap to walls pulls it toward the wall', async ({ page }, testInfo) => {
    await recordLabels(page);
    // Snap to walls is left on: its pull may only place the box where the box can get to.
    await page.addInitScript(() => localStorage.setItem('o3d_settings', JSON.stringify({ snapToWalls: true })));
    await openPlan(page, await planWith(testInfo, plan => { plan.houseFixed = true; }));
    await page.keyboard.press('Escape');
    await drag(page, await where(page, 'Box A'), -400, 0, 10);
    const { box, face } = leftEdges(await savedPlan(page));
    expect(box).toBeGreaterThanOrEqual(face - 0.5);
  });

  test('let a piece through while the house is not fixed', async ({ page }) => {
    await recordLabels(page);
    await openPlan(page, FIXTURE);
    await page.keyboard.press('Escape');
    await drag(page, await where(page, 'Box A'), -400, 0, 10);
    expect(boxA(await savedPlan(page)).position.x).toBeLessThan(0);
  });

  test('let Snap to walls pull a piece through while the house is not fixed', async ({ page }) => {
    await recordLabels(page);
    await page.addInitScript(() => localStorage.setItem('o3d_settings', JSON.stringify({ snapToWalls: true })));
    await openPlan(page, FIXTURE);
    await page.keyboard.press('Escape');
    await drag(page, await where(page, 'Box A'), -400, 0, 10);
    const moved = boxA(await savedPlan(page));
    // Where this drag ended before a fixed house's walls could stop the pull: on the wall's far face.
    expect(moved.position.x).toBeCloseTo(-175, 1);
    expect(moved.position.y).toBeCloseTo(200, 1);
    expect(moved.rotation || 0).toBe(0);
  });
});
