import { savedProjects } from './storage';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// The first screen's Import a Plan treats a plan already in the list as the list does.
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

test('the same file as a plan in the list opens that plan', async ({ page }) => {
  const source = JSON.parse(await readFile(fixture, 'utf8'));
  await storeAfterWelcome(page, source);
  await importPlan(page);
  await expect(page).toHaveURL(new RegExp(`/editor\\?id=${source.id}`));
  await expect(page.getByTitle('Click to rename', { exact: true })).toHaveText(source.name);
  expect(Object.keys(await savedProjects(page))).toEqual([source.id]);
});

test('a file that differs from a plan in the list asks, and Keep both numbers the copy', async ({ page }) => {
  const source = JSON.parse(await readFile(fixture, 'utf8'));
  await storeAfterWelcome(page, { ...source, name: 'Renamed in the list' });
  await importPlan(page);
  const question = page.getByRole('dialog', { name: 'You already have this plan' });
  await expect(question).toBeVisible();
  await question.getByRole('button', { name: /Keep both/ }).click();
  await expect(page.getByTitle('Click to rename', { exact: true })).toHaveText(`${source.name} (2)`);
  await expect.poll(async () => Object.keys(await savedProjects(page))).toHaveLength(2);
  expect((await savedProjects(page))[source.id].name).toBe('Renamed in the list');
});
