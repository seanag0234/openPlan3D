import { expect, test, type Page } from '@playwright/test';
import { fingers, ipadLandscape, ipadPortrait, openPlan, recordLabels, savedPlan, where } from './touch';

// The picking pill's Done and the bar for several picked things share the top of the plan:
// the bar stands under the pills, so Done is never covered and a press on it ends the picking.

const FIXTURE = 'tests/fixtures/room-with-boxes.openplan.json';
const item = (plan: any, id: string) => plan.floors[0].furniture.find((f: any) => f.id === id);
type Box = { x: number; y: number; width: number; height: number };

/** Open the room with nothing selected. */
async function open(page: Page) {
  await recordLabels(page);
  await openPlan(page, FIXTURE);
  await page.keyboard.press('Escape');
  await where(page, 'Box A');
  await where(page, 'Box B');
}

const bar = (page: Page) => page.locator('[data-align-bar]');
const pill = (page: Page) => page.locator('[data-tool-hint]');
const done = (page: Page) => pill(page).getByRole('button', { name: 'Done', exact: true });

function overlap(a: Box, b: Box) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** The bar shows two picked under the pill, Done is the thing at its own middle, and a press there ends the picking and moves nothing. */
async function checkDone(page: Page, press: (x: number, y: number) => Promise<void>) {
  await expect(bar(page)).toBeVisible();
  await expect(bar(page)).toContainText('2 selected');
  const doneBox = (await done(page).boundingBox())!;
  const pillBox = (await pill(page).boundingBox())!;
  const barBox = (await bar(page).boundingBox())!;
  expect(overlap(doneBox, barBox)).toBe(false);
  expect(barBox.y).toBeGreaterThanOrEqual(pillBox.y + pillBox.height - 0.5);

  const x = doneBox.x + doneBox.width / 2;
  const y = doneBox.y + doneBox.height / 2;
  const onTop = await page.evaluate(([px, py]) => {
    const el = document.elementFromPoint(px, py);
    const button = el?.closest('button');
    return { done: !!button?.closest('[data-tool-hint]'), text: button?.textContent?.trim() ?? '', label: button?.getAttribute('aria-label') ?? '' };
  }, [x, y]);
  expect(onTop).toEqual({ done: true, text: 'Done', label: '' });

  const before = await savedPlan(page);
  await press(x, y);
  await expect(pill(page)).toBeHidden();
  expect((await savedPlan(page)).floors).toEqual(before.floors);
}

for (const [name, device] of [['landscape', ipadLandscape], ['upright', ipadPortrait]] as const) {
  test.describe(`a finger on an iPad held ${name}`, () => {
    test.use(device);

    test('Select more, then a tap on Box B: the bar for two picked stands under the pill, and a tap on Done ends the picking', async ({ page }) => {
      const hand = await fingers(page);
      await open(page);
      const a = await where(page, 'Box A');
      await hand.longPress(a.x, a.y);
      const more = (await page.getByRole('menu').getByRole('menuitem', { name: /Select more/ }).boundingBox())!;
      await hand.tap(more.x + more.width / 2, more.y + more.height / 2);
      await expect(page.getByRole('menu')).toBeHidden();
      await expect(pill(page)).toBeVisible();
      const b = await where(page, 'Box B');
      await hand.tap(b.x, b.y);
      await checkDone(page, (x, y) => page.touchscreen.tap(x, y));
    });
  });
}

test('with a mouse, Select more, then a click on Box B: the bar stands under the pill, and a click on Done ends the picking', async ({ page }) => {
  await open(page);
  const a = await where(page, 'Box A');
  await page.mouse.click(a.x, a.y, { button: 'right' });
  await page.getByRole('menu').getByRole('menuitem', { name: /Select more/ }).click();
  await expect(page.getByRole('menu')).toBeHidden();
  await expect(pill(page)).toBeVisible();
  const b = await where(page, 'Box B');
  await page.mouse.click(b.x, b.y);
  await checkDone(page, (x, y) => page.mouse.click(x, y));
});

test('with no pill, the bar for two picked stands at the top of the plan and still lines them up', async ({ page }) => {
  await open(page);
  const before = await savedPlan(page);
  const a = await where(page, 'Box A');
  const b = await where(page, 'Box B');
  await page.mouse.click(a.x, a.y);
  await page.keyboard.down('Shift');
  await page.mouse.click(b.x, b.y);
  await page.keyboard.up('Shift');

  await expect(bar(page)).toBeVisible();
  await expect(bar(page)).toContainText('2 selected');
  await expect(pill(page)).toBeHidden();
  const canvas = (await page.getByLabel('Floor plan editor canvas', { exact: true }).boundingBox())!;
  const barBox = (await bar(page).boundingBox())!;
  expect(barBox.y - canvas.y).toBeGreaterThanOrEqual(8);
  expect(barBox.y - canvas.y).toBeLessThanOrEqual(12);

  // Box A and Box B stand side by side, 250 cm apart: Align Left moves one of them.
  await bar(page).getByRole('button', { name: 'Align Left', exact: true }).click();
  await expect.poll(async () => {
    const after = await savedPlan(page);
    return item(after, 'box-a').position.x !== item(before, 'box-a').position.x
      || item(after, 'box-b').position.x !== item(before, 'box-b').position.x;
  }).toBe(true);
});
