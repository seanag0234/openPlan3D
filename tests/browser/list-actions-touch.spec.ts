import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { ipadLandscape } from './touch';
import { savedProjects } from './storage';
import { openList } from './list';

/** One made-up plan in the list, then back on the list. */
async function onePlan(page: Page) {
  const text = await readFile('tests/fixtures/room-with-boxes.openplan.json', 'utf8');
  await page.addInitScript(() => localStorage.setItem('hasSeenWelcome', 'true'));
  await openList(page);
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open a plan file' }).click();
  await (await chooser).setFiles({ name: 'room.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  await expect(page).toHaveURL(/\/editor\?id=room-with-boxes/);
  await openList(page);
  await expect(page.getByRole('heading', { name: 'Room with boxes' })).toBeVisible();
  return page.getByRole('button', { name: 'Project actions for Room with boxes' });
}
const opacity = (page: Page) => page.getByRole('button', { name: 'Project actions for Room with boxes' })
  .evaluate(button => Number(getComputedStyle(button).opacity));

test.describe('iPad', () => {
  test.use(ipadLandscape);

  test('a plan in the list shows its actions to a finger, and Duplicate works by touch', async ({ page }) => {
    const actions = await onePlan(page);
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
    await expect.poll(() => opacity(page)).toBe(1);
    const box = (await actions.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    await actions.tap();
    const duplicate = page.getByRole('menuitem', { name: 'Duplicate' });
    await expect(duplicate).toBeVisible();
    expect((await duplicate.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await duplicate.tap();
    await expect.poll(async () => Object.keys(await savedProjects(page)).length).toBe(2);
  });
});

test.describe('mouse at 1366 px', () => {
  test.use({ viewport: { width: 1366, height: 900 } });

  test('the actions button stays out of sight until the pointer is on the card', async ({ page }) => {
    await onePlan(page);
    await page.mouse.move(5, 5);
    await expect.poll(() => opacity(page)).toBe(0);
    await page.getByRole('heading', { name: 'Room with boxes' }).hover();
    await expect.poll(() => opacity(page)).toBe(1);
  });
});
