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

test('Select more, then taps, pick several pieces that one drag moves together; a second tap drops one', async ({ page }) => {
  const { hand, before, a, b, scale } = await open(page);
  await hand.longPress(a.x, a.y);
  const more = (await page.getByRole('menu').getByRole('menuitem', { name: /Select more/ }).boundingBox())!;
  await hand.tap(more.x + more.width / 2, more.y + more.height / 2);
  await expect(page.getByRole('menu')).toBeHidden();
  await hand.tap(b.x, b.y);
  await hand.drag([a.x, a.y], [a.x + 80, a.y]);
  // Both captions slide right by the same amount.
  await expect.poll(async () => (await where(page, 'Box B')).x).toBeGreaterThan(b.x + 40);
  const a2 = await where(page, 'Box A');
  const b2 = await where(page, 'Box B');
  expect(Math.abs((a2.x - a.x) - (b2.x - b.x))).toBeLessThan(1);

  // A second tap on Box B takes it out: the next drag moves Box A alone.
  await hand.tap(b2.x, b2.y);
  await hand.drag([a2.x, a2.y], [a2.x, a2.y + 80]);
  const after = await savedPlan(page);
  const moved = (id: string) => ({ x: item(after, id).position.x - item(before, id).position.x, y: item(after, id).position.y - item(before, id).position.y });
  expect(moved('box-a').x).toBeGreaterThan(40 / scale);
  expect(moved('box-b').x).toBe(moved('box-a').x);
  expect(moved('box-a').y).toBeGreaterThan(40 / scale);
  expect(moved('box-b').y).toBe(0);
});

test('while picking several, a drag that starts outside the picked pieces slides the view and keeps them picked', async ({ page }) => {
  const { hand, before, a, b, scale } = await open(page);
  await hand.longPress(a.x, a.y);
  const more = (await page.getByRole('menu').getByRole('menuitem', { name: /Select more/ }).boundingBox())!;
  await hand.tap(more.x + more.width / 2, more.y + more.height / 2);
  await hand.tap(b.x, b.y);
  // Bare floor inside the room, 80 cm above Box A.
  await hand.drag([a.x, a.y - 80 * scale], [a.x + 100, a.y - 80 * scale]);
  const a2 = await where(page, 'Box A');
  expect(Math.abs(a2.x - (a.x + 100))).toBeLessThanOrEqual(3);
  // Both are still picked: a drag of Box A carries Box B.
  const b2 = await where(page, 'Box B');
  await hand.drag([a2.x, a2.y], [a2.x, a2.y + 60]);
  await expect.poll(async () => (await where(page, 'Box B')).y).toBeGreaterThan(b2.y + 30);
  const after = await savedPlan(page);
  const moved = (id: string) => item(after, id).position.y - item(before, id).position.y;
  expect(moved('box-a')).toBeGreaterThan(0);
  expect(moved('box-b')).toBe(moved('box-a'));
  expect(item(after, 'box-a').position.x).toBe(item(before, 'box-a').position.x);
  expect(after.floors[0].walls).toEqual(before.floors[0].walls);
});

test('one finger on bare paper slides the view and keeps the selection', async ({ page }) => {
  const { hand, before, a, scale } = await open(page);
  await hand.tap(a.x, a.y);
  await expect(fitSelection(page)).toBeEnabled();
  // 60 cm above the room's top wall, outside the room.
  const from: [number, number] = [a.x, a.y - 260 * scale];
  await hand.drag(from, [from[0] + 120, from[1]]);
  const now = await where(page, 'Box A');
  expect(Math.abs(now.x - (a.x + 120))).toBeLessThanOrEqual(3);
  expect(Math.abs(now.y - a.y)).toBeLessThanOrEqual(3);
  await expect(fitSelection(page)).toBeEnabled();
  expect((await savedPlan(page)).floors).toEqual(before.floors);
});

test('a tap on bare paper still clears the selection', async ({ page }) => {
  const { hand, a, scale } = await open(page);
  await hand.tap(a.x, a.y);
  await expect(fitSelection(page)).toBeEnabled();
  await hand.tap(a.x, a.y - 260 * scale);
  await expect(fitSelection(page)).toBeDisabled();
});
