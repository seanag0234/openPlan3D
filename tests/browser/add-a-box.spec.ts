import { expect, test, type Page } from '@playwright/test';
import { ipadPortrait, openPlan, savedPlan } from './touch';

const FIXTURE = 'tests/fixtures/room-with-boxes.openplan.json';
const pieces = async (page: Page) => (await savedPlan(page)).floors[0].furniture as any[];
const closeMenus = (page: Page) => page.keyboard.press('Escape');

test('Add a box puts one plain 3 ft box on the plan, undone in one step', async ({ page }) => {
  await openPlan(page, FIXTURE);
  const before = await pieces(page);
  await closeMenus(page);
  await page.getByRole('button', { name: 'Objects', exact: true }).click();
  await page.getByRole('button', { name: /^＋ Add a box\b/ }).click();
  // A mouse keeps the list open.
  await expect(page.locator('[data-build-folded]')).toHaveAttribute('data-build-folded', 'false');
  const after = await pieces(page);
  await closeMenus(page);
  expect(after).toHaveLength(before.length + 1);
  const box = after.find(item => !before.some(old => old.id === item.id));
  expect(box).toMatchObject({ name: 'Box', width: 91.44, depth: 91.44, height: 91.44, catalogId: 'imported_object' });
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await pieces(page)).toHaveLength(before.length);
});

test('a search with no match offers a plain box with that name', async ({ page }) => {
  await openPlan(page, FIXTURE);
  await page.getByRole('button', { name: 'Objects', exact: true }).click();
  const search = page.getByRole('textbox', { name: 'Search furniture...', exact: true });
  await search.fill('slide');
  await expect(page.getByText('Nothing in the list is called “slide”.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '＋ Add a plain box named “slide”', exact: true }).click();
  await expect(search).toHaveValue('');
  const box = (await pieces(page)).find(item => item.catalogId === 'imported_object' && item.name === 'slide');
  expect(box).toMatchObject({ width: 91.44, depth: 91.44, height: 91.44 });
});

test.describe('on an iPad held upright', () => {
  test.use(ipadPortrait);

  test('picking a thing to place folds the list out of the way', async ({ page }) => {
    await openPlan(page, FIXTURE);
    // Held upright the list starts folded away; Add brings it back.
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.getByRole('button', { name: 'Objects', exact: true }).click();
    const search = page.getByRole('textbox', { name: 'Search furniture...', exact: true });
    await expect(search).toBeVisible();
    await expect(page.locator('[data-build-folded]')).toHaveAttribute('data-build-folded', 'false');
    await page.getByRole('button', { name: /^Sofa(?: Sofa)? 200×90cm$/ }).first().click();
    // Folded: the list is out of view, or, before the fold is drawn, the panel says so.
    await expect.poll(async () => !(await search.isVisible())
      || await page.locator('[data-build-folded="true"]').count() > 0).toBe(true);
  });
});
