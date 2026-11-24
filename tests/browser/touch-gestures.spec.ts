import { expect, test, type Page } from '@playwright/test';
import { fingers, ipadLandscape, openPlan, recordLabels, savedPlan, where } from './touch';

test.use(ipadLandscape);

const FIXTURE = 'tests/fixtures/room-with-boxes.openplan.json';
const item = (plan: any, id: string) => plan.floors[0].furniture.find((f: any) => f.id === id);

/** Open the room with nothing selected; returns where Box A and Box B are drawn and screen px per cm. */
async function open(page: Page) {
  const hand = await fingers(page);
  await recordLabels(page);
  await openPlan(page, FIXTURE);
  const before = await savedPlan(page);
  await page.keyboard.press('Escape');
  const a = await where(page, 'Box A');
  const b = await where(page, 'Box B');
  // Box A and Box B stand 250 cm apart.
  const scale = (b.x - a.x) / 250;
  return { hand, before, a, b, scale };
}

const zoomText = (page: Page) => page.getByRole('button', { name: 'Zoom to 100%', exact: true }).innerText();
const fitSelection = (page: Page) => page.getByRole('button', { name: 'Fit selection', exact: true });

test('a pinch on Box A zooms the plan and selects nothing', async ({ page }) => {
  const { hand, a } = await open(page);
  await expect(fitSelection(page)).toBeDisabled();
  const zoomBefore = await zoomText(page);
  await hand.pinch([a.x, a.y], 60, 180);
  await expect.poll(() => zoomText(page)).not.toBe(zoomBefore);
  await expect(fitSelection(page)).toBeDisabled();
});

test('a second finger landing mid-drag does not end the drag of Box A', async ({ page }) => {
  const { hand, before, a, b, scale } = await open(page);
  // 100 cm: a whole number of grid steps, so the snap does not move it off the finger.
  await hand.drag([a.x, a.y], [a.x + 100 * scale, a.y], { steps: 12, second: [b.x, b.y - 150] });
  const after = await savedPlan(page);
  const moved = item(after, 'box-a').position.x - item(before, 'box-a').position.x;
  expect(Math.abs(moved - 100) * scale).toBeLessThanOrEqual(8);
  expect(item(after, 'box-a').position.y).toBe(item(before, 'box-a').position.y);
  expect(item(after, 'box-b')).toEqual(item(before, 'box-b'));
});

test('a plain drag lands Box A under the finger', async ({ page }) => {
  const { hand, a, scale } = await open(page);
  const to = { x: a.x + 75 * scale, y: a.y + 25 * scale };
  await hand.drag([a.x, a.y], [to.x, to.y]);
  const now = await where(page, 'Box A');
  expect(Math.abs(now.x - to.x)).toBeLessThanOrEqual(8);
  expect(Math.abs(now.y - to.y)).toBeLessThanOrEqual(8);
});

test('a long-press opens the menu, which stays open when the finger lifts and closes on a tap elsewhere', async ({ page }) => {
  const { hand, a, b } = await open(page);
  const menu = page.getByRole('menu');
  await hand.longPress(a.x, a.y);
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: /Bring to Front/ })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: /Select more/ })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: /^\S*\s*Note$/ })).toBeVisible();
  // The finger has lifted; the menu is still there.
  await page.waitForTimeout(300);
  await expect(menu).toBeVisible();
  await hand.tap(b.x, b.y + 120);
  await expect(menu).toBeHidden();
});

test('a long-press on the locked Rug offers Unlock', async ({ page }) => {
  const { hand } = await open(page);
  const rug = await where(page, 'Rug');
  await hand.longPress(rug.x, rug.y);
  await expect(page.getByRole('menu').getByRole('menuitem', { name: /Unlock/ })).toBeVisible();
});

test('a long-press on bare paper offers Select more first and a note about the plan last', async ({ page }) => {
  const { hand, a, scale } = await open(page);
  // 60 cm above the room's top wall.
  await hand.longPress(a.x, a.y - 260 * scale);
  const items = page.getByRole('menu').getByRole('menuitem');
  await expect(items.first()).toHaveText(/Select more/);
  await expect(items.last()).toHaveText(/Note about the plan/);
});
