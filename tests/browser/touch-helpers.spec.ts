import { expect, test } from '@playwright/test';
import { fingers, ipadLandscape, openPlan, recordLabels, savedPlan, where } from './touch';

test.use(ipadLandscape);

test('a finger drags Box A to the right and moves nothing else', async ({ page }) => {
  const hand = await fingers(page);
  await recordLabels(page);
  await openPlan(page, 'tests/fixtures/room-with-boxes.openplan.json');
  expect(await page.evaluate(() => [matchMedia('(pointer: coarse)').matches, matchMedia('(hover: hover)').matches])).toEqual([true, false]);
  const before = await savedPlan(page);
  await page.keyboard.press('Escape');
  const box = await where(page, 'Box A');
  await hand.drag([box.x, box.y], [box.x + 100, box.y]);
  await expect.poll(async () => (await where(page, 'Box A')).x).toBeGreaterThan(box.x + 50);
  const after = await savedPlan(page);
  const boxA = (plan: any) => plan.floors[0].furniture.find((item: any) => item.id === 'box-a');
  expect(boxA(after).position.x).toBeGreaterThan(boxA(before).position.x);
  expect(boxA(after).position.y).toBe(boxA(before).position.y);
  boxA(after).position.x = boxA(before).position.x;
  expect(after.floors).toEqual(before.floors);
});
