import { expect, test, type Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { openPlan, savedPlan } from './touch';

const FIXTURE = 'tests/fixtures/room-with-boxes.openplan.json';
const note = (page: Page) => page.locator('[data-house-fixed-note]');
const wallButton = (page: Page) => page.getByRole('button', { name: /^Draw Wall\b/ });
const rectangle = (page: Page) => page.getByRole('button', { name: /Rectangle$/ });
const wallCount = async (page: Page) => (await savedPlan(page)).floors[0].walls.length;

test('a plan whose house is fixed switches off the tools that build the house and says why', async ({ page }, testInfo) => {
  const plan = { houseFixed: true, ...JSON.parse(await readFile(FIXTURE, 'utf8')) };
  const file = testInfo.outputPath('house-fixed.openplan.json');
  await writeFile(file, JSON.stringify(plan));
  await openPlan(page, file);

  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await expect(note(page)).toBeVisible();
  await expect(note(page)).toContainText('The house is fixed');
  await expect(wallButton(page)).toBeDisabled();
  await expect(page.getByRole('button', { name: /^Single\b/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: /^Standard\b/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: /^Select V\b/ })).toBeEnabled();

  await page.getByRole('button', { name: 'Rooms', exact: true }).click();
  await expect(note(page)).toBeVisible();
  const presets = page.locator('button[draggable]');
  expect(await presets.count()).toBeGreaterThan(4);
  for (const preset of await presets.all()) await expect(preset).toBeDisabled();
  await rectangle(page).click({ force: true });
  expect(await wallCount(page)).toBe(4);
  await page.keyboard.press('Escape');

  // A wall tool picked up some other way (here the W key) is put down again.
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  const select = page.getByRole('button', { name: /^Select V\b/ });
  await expect(select).toHaveClass(/ring-1/);
  await page.getByLabel('Floor plan editor canvas', { exact: true }).focus();
  await page.keyboard.press('w');
  await page.waitForTimeout(200);
  await expect(select).toHaveClass(/ring-1/);
  await expect(wallButton(page)).not.toHaveClass(/ring-1/);
});

test('a plan whose house is free keeps its building tools', async ({ page }) => {
  await openPlan(page, FIXTURE);
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await expect(note(page)).toHaveCount(0);
  await expect(wallButton(page)).toBeEnabled();
  await page.getByRole('button', { name: 'Rooms', exact: true }).click();
  await expect(note(page)).toHaveCount(0);
  await rectangle(page).click();
  expect(await wallCount(page)).toBeGreaterThan(4);
});
