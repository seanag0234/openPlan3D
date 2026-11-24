import { savedProjects as library, storedRecords } from './storage';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Opening a plan file from inside a plan treats a plan already in the list as
// the list of plans does: the same file opens it, a different one asks first.
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
const question = (page: Page) => page.getByRole('dialog', { name: 'You already have this plan' });
const planName = (page: Page) => page.getByTitle('Click to rename', { exact: true });

test.use({ viewport: { width: 1440, height: 900 } });

test('the same file as the open plan opens that plan, with no copy and no question', async ({ page }) => {
  const plan = await seed(page);
  await importJSON(page);
  // Nothing on screen changes when the file is the plan itself: give a copy the time it would take to appear.
  await page.waitForTimeout(1500);
  await expect(planName(page)).toHaveText(plan.name);
  await expect(question(page)).toHaveCount(0);
  expect((await exportJSON(page)).id).toBe(plan.id);
  expect(Object.keys(await library(page))).toEqual([plan.id]);
});

test('a file that differs from the saved plan asks, and Cancel changes nothing', async ({ page }) => {
  const plan = await seed(page);
  await renameAndSave(page, plan.id, 'Renamed and saved');
  await importJSON(page);
  await expect(question(page)).toBeVisible();
  await question(page).getByRole('button', { name: /Cancel/ }).click();
  await expect(question(page)).toHaveCount(0);
  await expect(planName(page)).toHaveText('Renamed and saved');
  expect(Object.keys(await library(page))).toEqual([plan.id]);
});

test('Keep both brings the file in beside the plan, numbered', async ({ page }) => {
  const plan = await seed(page);
  await renameAndSave(page, plan.id, 'Renamed and saved');
  await importJSON(page);
  await question(page).getByRole('button', { name: /Keep both/ }).click();
  await expect(planName(page)).toHaveText(`${plan.name} (2)`);
  await expect.poll(async () => Object.keys(await library(page))).toHaveLength(2);
  expect((await library(page))[plan.id].name).toBe('Renamed and saved');
});

test('Replace mine puts the file in its place and keeps mine as a version', async ({ page }) => {
  const plan = await seed(page);
  await renameAndSave(page, plan.id, 'Renamed and saved');
  await importJSON(page);
  await question(page).getByRole('button', { name: /Replace mine with the file/ }).click();
  await expect(planName(page)).toHaveText(plan.name);
  await expect.poll(async () => (await library(page))[plan.id]?.name).toBe(plan.name);
  expect(Object.keys(await library(page))).toEqual([plan.id]);
  await expect.poll(async () => (await storedRecords(page, 'history'))[plan.id] ?? '').toContain('Before replacing with a file');
  await page.getByRole('button', { name: 'Version History', exact: true }).click();
  const versions = page.getByRole('dialog', { name: 'Version History', exact: true });
  await expect(versions.getByRole('group', { name: 'Before replacing with a file', exact: true })).toBeVisible();
});
