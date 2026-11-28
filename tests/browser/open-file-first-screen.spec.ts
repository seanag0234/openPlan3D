import { savedProjects } from './storage';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// The first screen's Import a Plan always makes a new plan, as the list does.
// The first screen shows only while the list is empty, so the plan arrives after it
// is on screen, the way a plan saved in another tab would.
const fixture = resolve('tests/fixtures/native-import.openplan.json');

async function storeAfterWelcome(page: Page, plan: unknown) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Welcome', exact: true })).toBeVisible();
  await page.evaluate(plan => new Promise<void>((done, fail) => {
    const open = indexedDB.open('openplan3d-local', 1);
    open.onerror = () => fail(open.error);
    open.onsuccess = () => {
      const db = open.result, tx = db.transaction('projects', 'readwrite');
      tx.objectStore('projects').put(JSON.stringify(plan), (plan as { id: string }).id);
      tx.oncomplete = () => { db.close(); done(); };
      tx.onabort = () => { db.close(); fail(tx.error); };
    };
  }), plan);
}
async function importPlan(page: Page) {
  const pending = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /Import a Plan/ }).click();
  await (await pending).setFiles(fixture);
}

test.use({ viewport: { width: 1440, height: 900 } });

test('the same file as a plan in the list comes in as a new plan beside it, numbered', async ({ page }) => {
  const source = JSON.parse(await readFile(fixture, 'utf8'));
  await storeAfterWelcome(page, source);
  await importPlan(page);
  await expect(page).toHaveURL(/\/editor\?id=/);
  expect(page.url()).not.toContain(source.id);
  await expect(page.getByTitle('Click to rename', { exact: true })).toHaveText(`${source.name} (2)`);
  await expect.poll(async () => Object.keys(await savedProjects(page))).toHaveLength(2);
  expect((await savedProjects(page))[source.id]).toEqual(source);
});

test('a file of a plan renamed in the list comes in as a new plan under the file\'s name', async ({ page }) => {
  const source = JSON.parse(await readFile(fixture, 'utf8'));
  await storeAfterWelcome(page, { ...source, name: 'Renamed in the list' });
  await importPlan(page);
  await expect(page.getByTitle('Click to rename', { exact: true })).toHaveText(source.name);
  await expect.poll(async () => Object.keys(await savedProjects(page))).toHaveLength(2);
  expect((await savedProjects(page))[source.id].name).toBe('Renamed in the list');
});
