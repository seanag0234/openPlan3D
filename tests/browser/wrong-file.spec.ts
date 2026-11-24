import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { openPlan, savedPlan } from './touch';
import { savedProjects } from './storage';

const notAPlan = { name: 'hello.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') };
/** A saved plan cut short, as half a download is: each browser words it its own way. */
const cutShort = {
  name: 'half.json', mimeType: 'application/json',
  buffer: Buffer.from(readFileSync('tests/fixtures/room-with-boxes.openplan.json', 'utf8').slice(0, 400)),
};
const plain = 'This file is not a plan. Nothing was changed: your plans are as they were.';

/** `technical`: the words kept under Details. */
async function expectPlainAnswer(page: Page, technical: RegExp) {
  const alert = page.getByRole('alert').filter({ hasText: plain });
  await expect(alert.getByText(plain)).toBeVisible();
  const words = alert.getByText(technical);
  await expect(words).toBeHidden();
  await expect(alert.getByText('Check the file or save your current plan, then try again.')).toHaveCount(0);
  await alert.getByText('Details', { exact: true }).click();
  await expect(words).toBeVisible();
  await alert.getByRole('button', { name: 'Dismiss import error' }).click();
  await expect(alert).toHaveCount(0);
}

for (const [what, file, technical] of [
  ['a file that is not a plan', notAPlan, /Invalid project:/],
  // Chromium, Safari and Firefox all name JSON in their own words for it.
  ['a plan file cut short', cutShort, /JSON/],
] as const) {
  test(`${what}, given to Import JSON in the editor, gets a plain answer`, async ({ page }) => {
    await openPlan(page, 'tests/fixtures/room-with-boxes.openplan.json');
    await expect.poll(async () => Object.keys(await savedProjects(page))).toContain('room-with-boxes');
    const before = await savedPlan(page);
    const stored = await savedProjects(page);
    const url = page.url();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Import JSON', exact: true }).click();
    await (await chooser).setFiles(file);
    await expectPlainAnswer(page, technical);
    expect(page.url()).toBe(url);
    await expect(page.getByRole('button', { name: 'Room with boxes', exact: true })).toBeVisible();
    expect(await savedPlan(page)).toEqual(before);
    expect(await savedProjects(page)).toEqual(stored);
  });

  test(`${what}, given to Open a plan file on the list, gets a plain answer`, async ({ page }) => {
    await openPlan(page, 'tests/fixtures/room-with-boxes.openplan.json');
    await expect.poll(async () => Object.keys(await savedProjects(page))).toContain('room-with-boxes');
    await page.goto('/');
    const before = await savedProjects(page);
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Open a plan file' }).click();
    await (await chooser).setFiles(file);
    await expectPlainAnswer(page, technical);
    await expect(page).toHaveURL(/\/$/);
    expect(await savedProjects(page)).toEqual(before);
  });
}
