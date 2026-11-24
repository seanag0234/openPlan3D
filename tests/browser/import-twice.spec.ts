import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ipadLandscape, recordLabels, where } from './touch';
import { savedProjects, storedRecords } from './storage';

const fixture = resolve('tests/fixtures/room-with-boxes.openplan.json');
const ID = 'room-with-boxes';

const boxA = (plan: any) => plan.floors[0].furniture.find((item: any) => item.id === 'box-a');

for (const [device, use] of [['mouse at 1366 px', { viewport: { width: 1366, height: 900 } }], ['iPad', ipadLandscape]] as const) {
  test.describe(device, () => {
    test.use(use);

    test('the same plan file twice is one plan; a changed plan is asked about', async ({ page }) => {
      const touch = device === 'iPad';
      const press = (target: Locator) => touch ? target.tap() : target.click();
      const text = await readFile(fixture, 'utf8');
      await page.addInitScript(() => {
        localStorage.setItem('hasSeenWelcome', 'true');
        localStorage.setItem('o3d_tips_seen', JSON.stringify(['first-wall', 'first-furniture', 'first-3d', 'first-export', 'first-door']));
      });
      await recordLabels(page);

      /** On the list: Open a plan file, with the made-up room. */
      async function openFile() {
        await page.goto('/');
        await expect(page.getByRole('heading', { name: 'Floor Plan Editor' })).toBeVisible();
        const chooser = page.waitForEvent('filechooser');
        await press(page.getByRole('button', { name: 'Open a plan file' }));
        await (await chooser).setFiles({ name: 'room-with-boxes.openplan.json', mimeType: 'application/json', buffer: Buffer.from(text) });
      }
      async function inEditor(id = ID) {
        await expect(page).toHaveURL(new RegExp(`/editor\\?id=${id}`));
        await expect(page.getByRole('button', { name: 'Room with boxes', exact: true })).toBeVisible();
      }
      async function moveBoxA(page: Page) {
        const box = await where(page, 'Box A');
        await page.mouse.move(box.x, box.y);
        await page.mouse.down();
        await page.mouse.move(box.x + 60, box.y, { steps: 8 });
        await page.mouse.move(box.x + 120, box.y, { steps: 8 });
        await page.mouse.up();
        await expect.poll(async () => boxA((await savedProjects(page))[ID]).position.x).toBeGreaterThan(160);
      }
      const question = () => page.getByRole('dialog', { name: 'You already have this plan' });

      await openFile();
      await inEditor();
      expect(Object.keys(await savedProjects(page))).toEqual([ID]);

      // The same file again opens the same plan.
      await openFile();
      await inEditor();
      await expect(question()).toHaveCount(0);
      expect(Object.keys(await savedProjects(page))).toEqual([ID]);

      // Box A moved: the file is no longer the same as the plan, so it asks. Keep both.
      await moveBoxA(page);
      await openFile();
      await expect(question()).toBeVisible();
      await expect(question()).toContainText('“Room with boxes” is in your list, and this file is not the same as it.');
      await press(question().getByRole('button', { name: /Keep both/ }));
      await expect(page).toHaveURL(/\/editor\?id=/);
      await expect(page.getByRole('button', { name: 'Room with boxes (2)', exact: true })).toBeVisible();
      let stored = await savedProjects(page);
      expect(Object.keys(stored)).toHaveLength(2);
      expect(Object.values(stored).map((plan: any) => plan.name).sort()).toEqual(['Room with boxes', 'Room with boxes (2)']);
      expect(boxA(stored[ID]).position.x).toBeGreaterThan(160);

      // Once more, replacing mine: Box A is back where the file has it, and mine is a version.
      await openFile();
      await press(question().getByRole('button', { name: /Replace mine with the file/ }));
      await inEditor();
      await expect.poll(async () => boxA((await savedProjects(page))[ID]).position.x).toBe(150);
      expect(Object.keys(await savedProjects(page))).toHaveLength(2);
      await expect.poll(async () => (await storedRecords(page, 'history'))[ID] ?? '').toContain('Before replacing with a file');

      // Moved again, then Cancel: nothing changes.
      await moveBoxA(page);
      stored = await savedProjects(page);
      await openFile();
      await press(question().getByRole('button', { name: /Cancel/ }));
      await expect(question()).toHaveCount(0);
      await expect(page).toHaveURL(/\/$/);
      expect(await savedProjects(page)).toEqual(stored);
    });
  });
}
