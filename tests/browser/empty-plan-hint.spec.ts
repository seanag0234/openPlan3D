import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { ipadLandscape } from './touch';

/** Open a made-up plan whose only floor holds nothing, as Export, Import JSON does. */
async function openEmptyPlan(page: Page) {
  const plan = JSON.parse(await readFile('tests/fixtures/connected-dimensions.openplan.json', 'utf8'));
  plan.name = 'Empty test plan';
  const floor = plan.floors[0];
  for (const key of ['walls', 'doors', 'windows', 'rooms', 'furniture', 'stairs', 'columns', 'textAnnotations', 'measurements', 'annotations', 'entourage']) floor[key] = [];
  plan.floors = [floor];
  await page.goto('/editor');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import JSON', exact: true }).click();
  await (await chooser).setFiles({ name: 'empty.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(plan)) });
  await expect(page.getByRole('button', { name: plan.name, exact: true })).toBeVisible();
  const first = page.getByText('Start building your floor plan', { exact: true });
  await expect(first).toBeVisible();
  // The box that holds both lines of the hint.
  return first.locator('..');
}

test.describe('iPad landscape', () => {
  test.use(ipadLandscape);

  test('an empty plan tells a finger where to start, with no key and no sidebar', async ({ page }) => {
    const hint = await openEmptyPlan(page);
    await expect(hint.getByText('Add walls, rooms and furniture from the list', { exact: true })).toBeVisible();
    const shown = await hint.innerText();
    expect(shown).not.toContain('W');
    expect(shown).not.toMatch(/sidebar/i);
  });
});

test('with a mouse an empty plan still names the W key and the sidebar', async ({ page }) => {
  const hint = await openEmptyPlan(page);
  await expect(hint.locator('div').nth(2)).toHaveText('Draw walls with W or drag items from the sidebar');
  await expect(hint).not.toContainText('Add walls, rooms and furniture from the list');
});
