import { expect, test, type Page } from '@playwright/test';
import { fingers, ipadLandscape, openPlan, recordLabels, savedPlan, where } from './touch';

// A selected measuring line is handed to the bar at the selection, which can then offer to remove it.
test.use(ipadLandscape);

const FIXTURE = 'tests/fixtures/room-with-boxes.openplan.json';

async function open(page: Page) {
  const hand = await fingers(page);
  await recordLabels(page);
  await openPlan(page, FIXTURE);
  const before = await savedPlan(page);
  await page.keyboard.press('Escape');
  const a = await where(page, 'Box A');
  const b = await where(page, 'Box B');
  const label = await where(page, 'Reading corner');
  const scale = (b.x - a.x) / 250;
  const screen = (x: number, y: number): [number, number] => [a.x + (x - 150) * scale, label.y + (y - 60) * scale];
  const wrapper = page.getByRole('application').filter({ has: page.getByLabel('Floor plan editor canvas', { exact: true }) });
  return { hand, before, screen, wrapper };
}

test('a tapped measuring line is handed to the bar, and Delete still removes it', async ({ page }) => {
  const { hand, before, screen, wrapper } = await open(page);
  await expect(wrapper).not.toHaveAttribute('data-extra-kind');
  // The measuring line runs from (50, 370) to (250, 370) cm.
  await hand.tap(...screen(120, 370));
  await expect(wrapper).toHaveAttribute('data-extra-kind', 'measurement');
  await page.keyboard.press('Delete');
  await expect(wrapper).not.toHaveAttribute('data-extra-kind');
  const after = await savedPlan(page);
  expect(after.floors[0].measurements).toEqual([]);
  expect(after.floors[0].furniture).toEqual(before.floors[0].furniture);
});

test('a tapped text label is handed to the bar as text', async ({ page }) => {
  const { hand, screen, wrapper } = await open(page);
  await hand.tap(...screen(300, 60));
  await expect(wrapper).toHaveAttribute('data-extra-kind', 'text');
  // Bare floor at the room's left, clear of the panel that opens on the right.
  const a = await where(page, 'Box A');
  await hand.tap(a.x - 100 * ((await where(page, 'Box B')).x - a.x) / 250, a.y);
  await expect(wrapper).not.toHaveAttribute('data-extra-kind');
});
