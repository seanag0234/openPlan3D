import { expect, test, type Page } from '@playwright/test';
import { fingers, ipadLandscape, recordLabels, where } from './touch';
import { savedProjects } from './storage';
import { journals, mouseDrag, openStored, reloadEditor, storedBoxAX } from './saving';

for (const device of ['mouse at 1366 px', 'iPad'] as const) {
  test.describe(device, () => {
    if (device === 'iPad') test.use(ipadLandscape);
    else test.use({ viewport: { width: 1366, height: 900 } });

    test('Undo after a reload takes back a move made before it', async ({ page }) => {
      const hand = device === 'iPad' ? await fingers(page) : null;
      await recordLabels(page);
      const plan = await openStored(page);
      const box = await where(page, 'Box A');
      if (hand) await hand.drag([box.x, box.y], [box.x + 100, box.y]);
      else await mouseDrag(page, box, 100);
      await expect.poll(() => storedBoxAX(page, plan.id)).toBeGreaterThan(150);
      const moved = await storedBoxAX(page, plan.id);
      await expect.poll(async () => (await journals(page))[plan.id]?.undo?.length ?? 0).toBeGreaterThan(0);

      await reloadEditor(page, plan.name);
      const undo = page.getByRole('button', { name: 'Undo', exact: true });
      await expect(undo).toBeEnabled();
      await undo.click();
      await expect.poll(() => storedBoxAX(page, plan.id)).toBe(150);
      await page.getByRole('button', { name: 'Redo', exact: true }).click();
      await expect.poll(() => storedBoxAX(page, plan.id)).toBe(moved);
    });
  });
}

test('deleting a plan from the list of plans deletes its kept Undo steps', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await recordLabels(page);
  const plan = await openStored(page);
  await mouseDrag(page, await where(page, 'Box A'), 100);
  await expect.poll(() => storedBoxAX(page, plan.id)).toBeGreaterThan(150);
  await expect.poll(async () => plan.id in await journals(page)).toBe(true);

  page.on('dialog', dialog => void dialog.accept());
  await page.goto('/');
  await deletePlan(page, plan.name);
  await expect.poll(async () => plan.id in await savedProjects(page)).toBe(false);
  await expect.poll(async () => plan.id in await journals(page)).toBe(false);
});

async function deletePlan(page: Page, name: string) {
  await page.getByRole('button', { name: `Project actions for ${name}`, exact: true }).click();
  await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
  await page.getByRole('dialog', { name: 'Delete project', exact: true }).getByRole('button', { name: 'Delete project', exact: true }).click();
}
