import { expect, test } from '@playwright/test';
import { fingers, ipadLandscape, labels, openPlan, recordLabels, savedPlan, where } from './touch';

test.use(ipadLandscape);

const FIXTURE = 'tests/fixtures/room-with-boxes.openplan.json';
const boxA = (plan: any) => plan.floors[0].furniture.find((f: any) => f.id === 'box-a');

test('a corner grabbed beside it by a finger grows by how far the finger moves, not by the gap', async ({ page }) => {
  const hand = await fingers(page);
  await recordLabels(page);
  await openPlan(page, FIXTURE);
  const before = boxA(await savedPlan(page));
  await page.keyboard.press('Escape');
  const name = await where(page, 'Box A'), b = await where(page, 'Box B');
  // Box A and Box B stand 250 cm apart; Box A's centre is halfway between its name line and its size line.
  const scale = (b.x - name.x) / 250;
  const size = (await labels(page)).find(line => line.text.includes(' × ') && Math.abs(line.x - name.x) < 0.5 && line.y > name.y)!;
  const centre = { x: name.x, y: (name.y + size.y) / 2 };
  await hand.tap(centre.x, centre.y);
  await expect(page.getByRole('button', { name: 'Fit selection', exact: true })).toBeEnabled();

  // Box A is 120 by 90 cm; put the finger 20 px out from its bottom-right corner on the diagonal.
  const corner = { x: centre.x + 60 * scale, y: centre.y + 45 * scale };
  const off = 20 / Math.SQRT2;
  const from: [number, number] = [corner.x + off, corner.y + off];
  await hand.drag(from, [from[0] + 30, from[1] + 30], { steps: 10 });

  const after = boxA(await savedPlan(page));
  const grown = 120 * after.scale.x - 120 * (before.scale?.x ?? 1);
  // 30 px of finger travel; the defect adds the 14 px gap to it as well.
  expect(grown).toBeGreaterThan(0);
  expect(Math.abs(grown - 30 / scale)).toBeLessThanOrEqual(2 / scale);
});
