import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { ipadLandscape } from './touch';

const PLAN = 'tests/fixtures/room-with-boxes.openplan.json';

async function openEditor(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('o3d_tips_seen', JSON.stringify(['first-wall', 'first-furniture', 'first-3d', 'first-export', 'first-door']));
  });
  await page.goto('/editor');
}

/** Press `open`, choose the fixture in the file chooser, and wait for its name in the top bar. */
async function chooseFixture(page: Page, open: () => Promise<void>) {
  const text = await readFile(PLAN, 'utf8');
  const chooser = page.waitForEvent('filechooser');
  await open();
  await (await chooser).setFiles({ name: 'room-with-boxes.openplan.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  await expect(page.getByRole('button', { name: JSON.parse(text).name, exact: true })).toBeVisible();
}

test('at 1366 px the top bar\'s Open button loads a plan file', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await openEditor(page);
  const open = page.locator('[data-bar="top"]').getByRole('button', { name: 'Open', exact: true });
  await expect(open).toHaveAttribute('title', 'Open a plan file');
  await chooseFixture(page, () => open.click());
});

test('the Export menu says which items open and save a plan file, keeping their names', async ({ page }) => {
  await openEditor(page);
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const menu = page.locator('[data-popup="menu"]');
  await expect(menu.getByText('Open a plan file', { exact: true })).toBeVisible();
  await expect(menu.getByText('Save this plan as a file', { exact: true })).toBeVisible();
  await expect(menu.getByRole('button', { name: 'Import JSON', exact: true })).toBeVisible();
  await expect(menu.getByRole('button', { name: 'Download JSON', exact: true })).toBeVisible();
});

test.describe('on a touch screen', () => {
  test.use(ipadLandscape);

  test('More, Open a plan file loads a plan file', async ({ page }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'More actions', exact: true }).click();
    const first = page.locator('[data-popup="menu"]').getByRole('button').first();
    await expect(first).toHaveText('Open a plan file');
    await chooseFixture(page, () => first.click());
  });
});
