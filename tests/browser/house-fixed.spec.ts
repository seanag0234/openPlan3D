import { expect, test, type Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { fingers, ipadLandscape, openPlan, recordLabels, savedPlan, where } from './touch';

// "Room with boxes" with its house fixed: walls, the window and the room do not answer to a press.
const FIXTURE = 'tests/fixtures/room-with-boxes.openplan.json';

async function writePlan(fixed: boolean): Promise<string> {
  const plan = JSON.parse(await readFile(FIXTURE, 'utf8'));
  if (fixed) plan.houseFixed = true;
  const file = test.info().outputPath(fixed ? 'house-fixed.openplan.json' : 'house-free.openplan.json');
  await writeFile(file, JSON.stringify(plan));
  return file;
}

/** Opens the plan; returns its saved state and a way to turn plan cm into screen px. */
async function open(page: Page, fixed: boolean) {
  await recordLabels(page);
  await openPlan(page, await writePlan(fixed));
  const opened = await savedPlan(page);
  await page.keyboard.press('Escape');
  const a = await where(page, 'Box A');
  const b = await where(page, 'Box B');
  const label = await where(page, 'Reading corner');
  // Box A and Box B stand 250 cm apart at y 200; the label is drawn at (300, 60).
  const scale = (b.x - a.x) / 250;
  const screen = (x: number, y: number): [number, number] => [a.x + (x - 150) * scale, label.y + (y - 60) * scale];
  return { opened, screen };
}

const house = (plan: any) => ({ walls: plan.floors[0].walls, windows: plan.floors[0].windows, rooms: plan.floors[0].rooms });

const FLOOR: [number, number] = [520, 330];   // bare floor inside the room
const WALL: [number, number] = [600, 200];    // the right-hand wall
const WINDOW: [number, number] = [300, 0];    // the window in the top wall

interface Hand {
  drag(from: [number, number], to: [number, number]): Promise<void>;
  doubleTap(at: [number, number]): Promise<void>;
}

function mouse(page: Page): Hand {
  return {
    async drag(from, to) {
      await page.mouse.move(...from);
      await page.mouse.down();
      await page.mouse.move(...to, { steps: 8 });
      await page.mouse.up();
    },
    async doubleTap(at) { await page.mouse.dblclick(...at); },
  };
}

async function finger(page: Page): Promise<Hand> {
  const hand = await fingers(page);
  return { drag: (from, to) => hand.drag(from, to), doubleTap: at => hand.doubleTap(...at) };
}

/** Each press on the fixed house leaves the walls, the window and the room as they were, with no text box open. */
async function pressesLeaveTheHouse(page: Page, hand: Hand) {
  const { opened, screen } = await open(page, true);
  const floor = screen(...FLOOR), wall = screen(...WALL), win = screen(...WINDOW);
  const presses: [string, () => Promise<void>][] = [
    ['a 50 px drag on bare floor', () => hand.drag(floor, [floor[0] + 50, floor[1]])],
    ['a 6 px slip on bare floor', () => hand.drag(floor, [floor[0] + 6, floor[1]])],
    ['a double-tap on a wall', () => hand.doubleTap(wall)],
    ['a 40 px drag on the window', () => hand.drag(win, [win[0] + 40, win[1]])],
    ['a double-tap on bare floor', () => hand.doubleTap(floor)],
  ];
  for (const [name, press] of presses) {
    await press();
    await expect(page.locator('input.absolute'), name).toHaveCount(0);
    expect(house(await savedPlan(page)), name).toEqual(house(opened));
    await page.keyboard.press('Escape');
  }
}

test.describe('with a mouse', () => {
  test('presses on a fixed house move, split and rename nothing', async ({ page }) => {
    await pressesLeaveTheHouse(page, mouse(page));
  });

  test('the menu on a fixed wall, window or room offers only a note and selects nothing', async ({ page }) => {
    const { opened, screen } = await open(page, true);
    const menu = page.getByRole('menu');
    for (const at of [WALL, WINDOW, FLOOR]) {
      await page.mouse.click(...screen(...at), { button: 'right' });
      await expect(menu.getByRole('menuitem')).toHaveCount(1);
      await expect(menu.getByRole('menuitem')).toHaveText(/Note/);
      await expect(menu).toContainText('The house is fixed');
      await expect(page.getByRole('button', { name: 'Fit selection', exact: true })).toBeDisabled();
      await page.keyboard.press('Escape');
      await expect(menu).toHaveCount(0);
    }
    expect(house(await savedPlan(page))).toEqual(house(opened));
  });

  test('a selection box and Select All leave a fixed house out', async ({ page }) => {
    const { opened, screen } = await open(page, true);
    const boxes = (plan: any) => plan.floors[0].furniture.filter((f: any) => f.id.startsWith('box-'));
    // A box drawn from outside the room's top-left corner to past its bottom-right one, then Delete.
    await mouse(page).drag(screen(-60, -60), screen(660, 460));
    await page.keyboard.press('Delete');
    let after = await savedPlan(page);
    expect(house(after)).toEqual(house(opened));
    expect(boxes(after)).toEqual([]);
    await page.keyboard.press('Escape');
    await page.keyboard.press('ControlOrMeta+z');
    expect(boxes(await savedPlan(page))).toHaveLength(2);
    await page.keyboard.press('Escape');
    await page.getByLabel('Floor plan editor canvas', { exact: true }).focus();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Delete');
    after = await savedPlan(page);
    expect(house(after)).toEqual(house(opened));
    expect(boxes(after)).toEqual([]);
  });

  test('without the flag a drag on the floor still moves the walls', async ({ page }) => {
    const { opened, screen } = await open(page, false);
    const floor = screen(...FLOOR);
    await mouse(page).drag(floor, [floor[0] + 50, floor[1]]);
    const after = await savedPlan(page);
    expect(after.floors[0].walls[0].start.x).toBeGreaterThan(opened.floors[0].walls[0].start.x);
  });
});

test.describe('with fingers', () => {
  test.use(ipadLandscape);

  test('presses on a fixed house move, split and rename nothing', async ({ page }) => {
    await pressesLeaveTheHouse(page, await finger(page));
  });
});
