import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ipadLandscape, recordLabels, where } from './touch';
import { savedProjects } from './storage';
import { openList } from './list';

const fixture = resolve('tests/fixtures/room-with-boxes.openplan.json');
const ID = 'room-with-boxes';

const boxA = (plan: any) => plan.floors[0].furniture.find((item: any) => item.id === 'box-a');

for (const [device, use] of [['mouse at 1366 px', { viewport: { width: 1366, height: 900 } }], ['iPad', ipadLandscape]] as const) {
  test.describe(device, () => {
    test.use(use);

    test('every time a plan file is opened it is a new plan, and the plans before it are untouched', async ({ page }) => {
      const touch = device === 'iPad';
      const press = (target: Locator) => touch ? target.tap() : target.click();
      const text = await readFile(fixture, 'utf8');
      await page.addInitScript(() => {
        localStorage.setItem('hasSeenWelcome', 'true');
        localStorage.setItem('o3d_tips_seen', JSON.stringify(['first-wall', 'first-furniture', 'first-3d', 'first-export', 'first-door']));
      });
      await recordLabels(page);

      /** On the list: Open a plan file, with the made-up room. Returns the new plan's id. */
      async function openFile(name: string) {
        await openList(page);
        const chooser = page.waitForEvent('filechooser');
        await press(page.getByRole('button', { name: 'Open a plan file' }));
        await (await chooser).setFiles({ name: 'room-with-boxes.openplan.json', mimeType: 'application/json', buffer: Buffer.from(text) });
        await expect(page).toHaveURL(/\/editor\?id=/);
        await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
        const id = new URL(page.url()).searchParams.get('id')!;
        expect(id).not.toBe(ID);
        return id;
      }
      async function moveBoxA(page: Page, id: string) {
        const box = await where(page, 'Box A');
        await page.mouse.move(box.x, box.y);
        await page.mouse.down();
        await page.mouse.move(box.x + 60, box.y, { steps: 8 });
        await page.mouse.move(box.x + 120, box.y, { steps: 8 });
        await page.mouse.up();
        await expect.poll(async () => boxA((await savedProjects(page))[id]).position.x).toBeGreaterThan(160);
      }

      const first = await openFile('Room with boxes');
      expect(Object.keys(await savedProjects(page))).toEqual([first]);

      // The same file again, unchanged: a second plan, numbered.
      const second = await openFile('Room with boxes (2)');
      await expect.poll(async () => Object.keys(await savedProjects(page)).sort()).toEqual([first, second].sort());

      // The second plan changed, then the file once more: a third plan, as the file has it.
      await moveBoxA(page, second);
      const third = await openFile('Room with boxes (3)');
      await expect.poll(async () => Object.keys(await savedProjects(page))).toHaveLength(3);
      const stored = await savedProjects(page);
      expect(boxA(stored[second]).position.x).toBeGreaterThan(160);
      expect(boxA(stored[first]).position.x).toBe(150);
      expect(boxA(stored[third]).position.x).toBe(150);
    });
  });
}
