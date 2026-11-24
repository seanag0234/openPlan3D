import { expect, test, type Page } from '@playwright/test';
import { openPlan, recordLabels, savedPlan, where } from './touch';

// A mouse, no touch: Select more from the right-click menu, then plain clicks add or drop pieces as a finger's taps do.

const FIXTURE = 'tests/fixtures/room-with-boxes.openplan.json';
const item = (plan: any, id: string) => plan.floors[0].furniture.find((f: any) => f.id === id);
type Spot = { x: number; y: number };

/** Open the room with nothing selected. */
async function open(page: Page) {
  await recordLabels(page);
  await openPlan(page, FIXTURE);
  const before = await savedPlan(page);
  await page.keyboard.press('Escape');
  await where(page, 'Box A');
  await where(page, 'Box B');
  return before;
}

/** Screen px per cm: Box A and Box B stand 250 cm apart until one of them moves. */
async function scaleNow(page: Page) {
  return ((await where(page, 'Box B')).x - (await where(page, 'Box A')).x) / 250;
}

/** Right-click a piece and choose Select more. */
async function selectMore(page: Page, label: string) {
  const at = await where(page, label);
  await page.mouse.click(at.x, at.y, { button: 'right' });
  await page.getByRole('menu').getByRole('menuitem', { name: /Select more/ }).click();
  await expect(page.getByRole('menu')).toBeHidden();
  await expect(page.locator('[data-tool-hint]')).toBeVisible();
}

async function click(page: Page, at: Spot) {
  await page.mouse.click(at.x, at.y);
}

/** Press the mouse at `from` and drag it by dx, dy before letting go. */
async function drag(page: Page, from: Spot, dx: number, dy: number) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 12 });
  await page.mouse.up();
}

function moved(before: any, after: any, id: string) {
  return { x: item(after, id).position.x - item(before, id).position.x, y: item(after, id).position.y - item(before, id).position.y };
}

test('after Select more, a click adds Box B and one drag of Box A moves both; a second click drops it', async ({ page }) => {
  const before = await open(page);
  await selectMore(page, 'Box A');
  await click(page, await where(page, 'Box B'));
  await drag(page, await where(page, 'Box A'), 80, 0);
  const first = await savedPlan(page);
  const one = { a: moved(before, first, 'box-a'), b: moved(before, first, 'box-b') };
  expect(one.a.x).toBeGreaterThan(0);
  expect(one.b).toEqual(one.a);

  // A second click on Box B takes it out: the next drag moves Box A alone.
  await click(page, await where(page, 'Box B'));
  await drag(page, await where(page, 'Box A'), 0, 80);
  const second = await savedPlan(page);
  expect(moved(first, second, 'box-a').y).toBeGreaterThan(0);
  expect(item(second, 'box-b')).toEqual(item(first, 'box-b'));
});

test('while picking several, a click on bare floor between the pieces keeps both picked', async ({ page }) => {
  const before = await open(page);
  await selectMore(page, 'Box A');
  await click(page, await where(page, 'Box B'));
  const a = await where(page, 'Box A');
  const b = await where(page, 'Box B');
  // Midway between the two boxes: bare floor inside the box around them.
  await click(page, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  expect((await savedPlan(page)).floors).toEqual(before.floors);
  await drag(page, await where(page, 'Box A'), 80, 0);
  const after = await savedPlan(page);
  expect(moved(before, after, 'box-a').x).toBeGreaterThan(0);
  expect(moved(before, after, 'box-b')).toEqual(moved(before, after, 'box-a'));
});

test('while picking several, a mouse drag on bare floor outside the pieces slides the view and keeps them picked', async ({ page }) => {
  const before = await open(page);
  await selectMore(page, 'Box A');
  await click(page, await where(page, 'Box B'));
  const scale = await scaleNow(page);
  const a = await where(page, 'Box A');
  // Bare floor inside the room, below and left of Box A: outside the box around the two picked pieces.
  await drag(page, { x: a.x - 30 * scale, y: a.y + 105 * scale }, 100, 0);
  expect((await savedPlan(page)).floors).toEqual(before.floors);
  const a2 = await where(page, 'Box A');
  expect(Math.abs(a2.x - (a.x + 100))).toBeLessThanOrEqual(3);
  expect(Math.abs(a2.y - a.y)).toBeLessThanOrEqual(3);
  // Both are still picked: a drag of Box A carries Box B.
  await drag(page, a2, 0, 60);
  const after = await savedPlan(page);
  expect(moved(before, after, 'box-a').y).toBeGreaterThan(0);
  expect(moved(before, after, 'box-b')).toEqual(moved(before, after, 'box-a'));
});

test('Done on the picking pill ends the mode: the next click picks one piece alone', async ({ page }) => {
  const before = await open(page);
  await selectMore(page, 'Box A');
  await page.locator('[data-tool-hint]').getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.locator('[data-tool-hint]')).toBeHidden();
  await click(page, await where(page, 'Box B'));
  await drag(page, await where(page, 'Box B'), 0, 80);
  const after = await savedPlan(page);
  expect(moved(before, after, 'box-b').y).toBeGreaterThan(0);
  expect(item(after, 'box-a')).toEqual(item(before, 'box-a'));
});

test('without Select more, a click on Box A then on Box B picks Box B alone', async ({ page }) => {
  const before = await open(page);
  await click(page, await where(page, 'Box A'));
  await click(page, await where(page, 'Box B'));
  await drag(page, await where(page, 'Box B'), 0, 80);
  const after = await savedPlan(page);
  expect(moved(before, after, 'box-b').y).toBeGreaterThan(0);
  expect(item(after, 'box-a')).toEqual(item(before, 'box-a'));
});

test('with a mouse, the picking pill says Click and holds Done', async ({ page }) => {
  await open(page);
  await selectMore(page, 'Box A');
  const pill = page.locator('[data-tool-hint]');
  await expect(pill).toContainText('Click things to add them');
  await expect(pill.getByRole('button', { name: 'Done', exact: true })).toBeVisible();
});
