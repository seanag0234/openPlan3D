import { expect, test, type Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { openPlan } from './touch';

/** The room with boxes, its walls moved out to a house 40 by 30 m, fixed or not. */
async function bigHouse(file: string, houseFixed: boolean): Promise<string> {
  const plan = JSON.parse(await readFile('tests/fixtures/room-with-boxes.openplan.json', 'utf8'));
  const corners = [{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 3000 }, { x: 0, y: 3000 }];
  plan.floors[0].walls.forEach((wall: any, i: number) => { wall.start = corners[i]; wall.end = corners[(i + 1) % 4]; });
  if (houseFixed) plan.houseFixed = true;
  await writeFile(file, JSON.stringify(plan));
  return file;
}

const zoomOf = async (page: Page) => Number((await page.getByText(/^Zoom: \d+%$/).innerText()).match(/\d+/)![0]);
/** The zoom once it reads the same two frames running. */
async function settledZoom(page: Page): Promise<number> {
  let last = -1;
  await expect.poll(async () => {
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const now = await zoomOf(page), same = now === last;
    last = now;
    return same;
  }).toBe(true);
  return last;
}
const fit = (page: Page) => page.getByTitle('Zoom to Fit (F)', { exact: true }).first().click();

test('Fit frames the pieces while the house is fixed, and everything on a second press', async ({ page, browser }, testInfo) => {
  // The same plan with the house not fixed, in a browser of its own: Fit frames the whole house.
  const loose = await (await browser.newContext({ viewport: page.viewportSize() })).newPage();
  await openPlan(loose, await bigHouse(testInfo.outputPath('loose.json'), false));
  await loose.keyboard.press('Escape');
  await fit(loose);
  const whole = await settledZoom(loose);
  await loose.context().close();

  await openPlan(page, await bigHouse(testInfo.outputPath('fixed.json'), true));
  await page.keyboard.press('Escape');
  await fit(page);
  await expect.poll(() => zoomOf(page)).toBeGreaterThan(whole);
  await fit(page);
  await expect.poll(() => zoomOf(page)).toBe(whole);
});
