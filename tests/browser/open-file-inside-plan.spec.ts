import { savedProjects as library } from './storage';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Opening a plan file from inside a plan always makes a new plan, as the list of plans does.
const fixture = resolve('tests/fixtures/native-import.openplan.json');
async function seed(page: Page) {
  const source = JSON.parse(await readFile(fixture, 'utf8'));
  await page.addInitScript(source => {
    if (!localStorage.getItem('floorplan_projects')) {
      localStorage.setItem('floorplan_projects', JSON.stringify({ [source.id]: JSON.stringify(source) }));
    }
    localStorage.setItem('hasSeenWelcome', 'true');
    // Keep edits pending throughout UI actions, independent of CI machine speed.
    const timeout = window.setTimeout.bind(window);
    window.setTimeout = ((handler: TimerHandler, delay?: number, ...args: any[]) =>
      timeout(handler, delay === 1000 ? 60_000 : delay, ...args)) as typeof window.setTimeout;
  }, source);
  await page.goto(`/editor?id=${source.id}`);
  await expect(page.getByRole('application')).toContainText('1 room');
  return source;
}
async function rename(page: Page, name: string) {
  await page.getByTitle('Click to rename', { exact: true }).click();
  await page.getByRole('textbox', { name: 'Project name' }).fill(name);
  await page.getByRole('textbox', { name: 'Project name' }).press('Enter');
}
async function importJSON(page: Page, file = fixture) {
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const pending = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import JSON', exact: true }).click();
  await (await pending).setFiles(file);
}
async function exportJSON(page: Page) {
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download JSON', exact: true }).click();
  return JSON.parse(await readFile((await (await pending).path())!, 'utf8'));
}
async function renameAndSave(page: Page, id: string, name: string) {
  await rename(page, name);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved ✓', { exact: true })).toBeVisible();
  await expect.poll(async () => (await library(page))[id]?.name).toBe(name);
}
const planName = (page: Page) => page.getByTitle('Click to rename', { exact: true });

test.use({ viewport: { width: 1440, height: 900 } });

test('the same file as the open plan comes in as a new plan beside it, numbered, and the open plan is untouched', async ({ page }) => {
  const plan = await seed(page);
  const before = (await library(page))[plan.id];
  await importJSON(page);
  await expect(planName(page)).toHaveText(`${plan.name} (2)`);
  const opened = await exportJSON(page);
  expect(opened.id).not.toBe(plan.id);
  await expect.poll(async () => Object.keys(await library(page)).sort()).toEqual([plan.id, opened.id].sort());
  expect((await library(page))[plan.id]).toEqual(before);
});

test('a file of a plan renamed and saved since comes in as a new plan under the file\'s name', async ({ page }) => {
  const plan = await seed(page);
  await renameAndSave(page, plan.id, 'Renamed and saved');
  await importJSON(page);
  await expect(planName(page)).toHaveText(plan.name);
  await expect.poll(async () => Object.keys(await library(page))).toHaveLength(2);
  expect((await library(page))[plan.id].name).toBe('Renamed and saved');
});
