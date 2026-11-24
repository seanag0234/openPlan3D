import { expect, test } from '@playwright/test';
import { openPlan, recordLabels, savedPlan, where } from './touch';

test('Duplicate puts the copy beside the original, not on top of it', async ({ page }) => {
  await recordLabels(page);
  await openPlan(page, 'tests/fixtures/room-with-boxes.openplan.json');
  const at = await where(page, 'Box A');
  await page.mouse.click(at.x, at.y);
  await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
  const furniture = (await savedPlan(page)).floors[0].furniture as any[];
  expect(furniture).toHaveLength(4);
  const copy = furniture.find(item => item.name === 'Box A' && item.id !== 'box-a');
  // Box A is 120 cm wide at (150, 200): the copy lands its width and a 10 cm gap to the right.
  expect(copy.position).toEqual({ x: 280, y: 200 });
});
