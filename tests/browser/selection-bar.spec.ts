import { expect, test, type Page } from '@playwright/test';
import { openPlan, recordLabels, where } from './touch';

const FIXTURE = 'tests/fixtures/room-with-boxes.openplan.json';
type Rect = { x: number; y: number; width: number; height: number };
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Screen px per cm, from the zoom the status bar shows. */
async function scale(page: Page) {
  return Number((await page.getByText(/^Zoom: \d+%$/).innerText()).match(/\d+/)![0]) / 100;
}

/** Box A's outline on screen. The "Reading corner" label is drawn centred on its point, (300, 60) cm. */
async function boxA(page: Page): Promise<Rect> {
  const k = await scale(page), label = await where(page, 'Reading corner');
  const cx = label.x + (150 - 300) * k, cy = label.y + (200 - 60) * k;
  return { x: cx - 60 * k, y: cy - 45 * k, width: 120 * k, height: 90 * k };
}

test('the bar stays clear of a large piece and its turn handle', async ({ page }) => {
  await recordLabels(page);
  await openPlan(page, FIXTURE);
  await page.keyboard.press('Escape');
  const caption = await where(page, 'Box A');
  await page.mouse.click(caption.x, caption.y - 24);
  await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('Box A');
  await page.getByRole('button', { name: 'Fit selection', exact: true }).click();
  for (let i = 0; i < 6 && 90 * await scale(page) < 300; i++) await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  const piece = await boxA(page);
  expect(piece.height).toBeGreaterThanOrEqual(300);
  const bar = (await page.locator('[data-selection-bar]').boundingBox())!;
  expect(overlaps(bar, piece)).toBe(false);
  // With a mouse the turn handle is a 5 px circle 18 px above the top edge.
  const handle = { x: piece.x + piece.width / 2 - 5, y: piece.y - 18 - 5, width: 10, height: 10 };
  expect(overlaps(bar, handle)).toBe(false);
  expect(bar.y + bar.height).toBeLessThanOrEqual(handle.y);
});
