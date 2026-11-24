import { expect, test, type Page } from '@playwright/test';
import { openPlan, savedPlan } from './touch';
import { savedProjects } from './storage';

const notAPlan = { name: 'hello.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') };
const plain = 'This file is not a plan. Nothing was changed: your plans are as they were.';

async function expectPlainAnswer(page: Page) {
  const alert = page.getByRole('alert').filter({ hasText: plain });
  await expect(alert.getByText(plain)).toBeVisible();
  const technical = alert.getByText(/Invalid project:/);
  await expect(technical).toBeHidden();
  await expect(alert.getByText('Check the file or save your current plan, then try again.')).toHaveCount(0);
  await alert.getByText('Details', { exact: true }).click();
  await expect(technical).toBeVisible();
  await alert.getByRole('button', { name: 'Dismiss import error' }).click();
  await expect(alert).toHaveCount(0);
}

test('a file that is not a plan, given to Import JSON in the editor, gets a plain answer', async ({ page }) => {
  await openPlan(page, 'tests/fixtures/room-with-boxes.openplan.json');
  const before = await savedPlan(page);
  const url = page.url();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import JSON', exact: true }).click();
  await (await chooser).setFiles(notAPlan);
  await expectPlainAnswer(page);
  expect(page.url()).toBe(url);
  await expect(page.getByRole('button', { name: 'Room with boxes', exact: true })).toBeVisible();
  expect(await savedPlan(page)).toEqual(before);
});

test('a file that is not a plan, given to Open a plan file on the list, gets a plain answer', async ({ page }) => {
  await openPlan(page, 'tests/fixtures/room-with-boxes.openplan.json');
  await expect.poll(async () => Object.keys(await savedProjects(page))).toContain('room-with-boxes');
  await page.goto('/');
  const before = await savedProjects(page);
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open a plan file' }).click();
  await (await chooser).setFiles(notAPlan);
  await expectPlainAnswer(page);
  await expect(page).toHaveURL(/\/$/);
  expect(await savedProjects(page)).toEqual(before);
});
