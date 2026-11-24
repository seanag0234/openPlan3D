import { expect, test } from '@playwright/test';
import { recordLabels, where } from './touch';
import { journals, mouseDrag, openStored, reloadEditor, storedBoxAX } from './saving';

test.use({ viewport: { width: 1366, height: 900 } });

test('a move made in the last second before a reload is kept and can be undone', async ({ page }) => {
  await recordLabels(page);
  const plan = await openStored(page);
  await expect(page.getByText('Saved ✓')).toBeVisible();
  await expect.poll(async () => plan.id in await journals(page)).toBe(true);
  const box = await where(page, 'Box A');
  await mouseDrag(page, box, 100);
  await reloadEditor(page, plan.name);

  await expect.poll(() => storedBoxAX(page, plan.id)).toBeGreaterThan(150);
  const undo = page.getByRole('button', { name: 'Undo', exact: true });
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect.poll(() => storedBoxAX(page, plan.id)).toBe(150);
});
