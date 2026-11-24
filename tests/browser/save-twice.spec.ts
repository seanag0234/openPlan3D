import { expect, test } from '@playwright/test';
import { recordLabels, where } from './touch';
import { mouseDrag, openStored, openVersions, storedBoxAX } from './saving';

test.use({ viewport: { width: 1366, height: 900 } });

test('pressing Save again with nothing changed adds no version', async ({ page }) => {
  await recordLabels(page);
  const plan = await openStored(page);
  await mouseDrag(page, await where(page, 'Box A'), 100);
  await expect.poll(() => storedBoxAX(page, plan.id)).toBeGreaterThan(150);
  const save = page.getByRole('button', { name: 'Save', exact: true });
  for (let i = 0; i < 3; i++) {
    await save.click();
    await expect(page.getByText('Saved ✓')).toBeVisible();
  }
  const versions = await openVersions(page);
  await expect(versions.getByRole('group', { name: 'Manual save', exact: true }).first()).toBeVisible();
  await expect(versions.getByRole('group', { name: 'Manual save', exact: true })).toHaveCount(1);
});
