import { expect, test, type Page } from '@playwright/test';
import { fingers, ipadLandscape, recordLabels, where } from './touch';
import { mouseDrag, openStored, openVersions, storedBoxAX } from './saving';

const opacity = (page: Page, name: string) => page.getByRole('dialog', { name: 'Version History', exact: true })
  .getByRole('group', { name, exact: true }).first().getByRole('button', { name: 'Restore', exact: true })
  .evaluate(button => getComputedStyle(button).opacity);

async function movedAndSaved(page: Page, drag: (box: { x: number; y: number }) => Promise<void>) {
  await recordLabels(page);
  const plan = await openStored(page);
  await drag(await where(page, 'Box A'));
  await expect.poll(() => storedBoxAX(page, plan.id)).toBeGreaterThan(150);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const versions = await openVersions(page);
  await expect(versions.getByRole('group', { name: 'Manual save', exact: true })).toBeVisible();
  await expect(versions.getByRole('group', { name: 'Session start', exact: true })).toBeVisible();
  return { plan, versions };
}

test.describe('on an iPad', () => {
  test.use(ipadLandscape);

  test('each version shows its Restore button, and pressing it brings that version back', async ({ page }) => {
    const hand = await fingers(page);
    const { plan, versions } = await movedAndSaved(page, box => hand.drag([box.x, box.y], [box.x + 100, box.y]));
    expect(await opacity(page, 'Manual save')).toBe('1');
    expect(await opacity(page, 'Session start')).toBe('1');
    page.once('dialog', dialog => void dialog.accept());
    await versions.getByRole('group', { name: 'Session start', exact: true }).getByRole('button', { name: 'Restore', exact: true }).tap();
    await expect.poll(() => storedBoxAX(page, plan.id)).toBe(150);
  });
});

test('with a mouse, Restore shows while the pointer is on its line', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  const { versions } = await movedAndSaved(page, box => mouseDrag(page, box, 100));
  await page.mouse.move(5, 5);
  expect(await opacity(page, 'Manual save')).toBe('0');
  await versions.getByRole('group', { name: 'Manual save', exact: true }).hover();
  await expect.poll(() => opacity(page, 'Manual save')).toBe('1');
  expect(await opacity(page, 'Session start')).toBe('0');
});
