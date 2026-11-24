import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { ipadLandscape, openPlan, savedPlan } from './touch';

const PLAN = 'tests/fixtures/room-with-boxes.openplan.json';

/** Stands in for the system share sheet and keeps what it was handed. */
async function stubShare(page: Page) {
  await page.addInitScript(() => {
    const w = window as any;
    w.__shared = [];
    Object.defineProperty(Navigator.prototype, 'canShare', { configurable: true, value: (data: any) => Array.isArray(data?.files) && data.files.length > 0 });
    Object.defineProperty(Navigator.prototype, 'share', {
      configurable: true,
      value: async (data: any) => {
        w.__shared.push({ title: data.title, files: await Promise.all(data.files.map(async (file: File) => ({ name: file.name, type: file.type, text: await file.text() }))) });
      },
    });
  });
}

async function noShare(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'canShare', { configurable: true, value: undefined });
    Object.defineProperty(Navigator.prototype, 'share', { configurable: true, value: undefined });
  });
}

const sameRoom = (sent: any, saved: any) => {
  expect(sent.id).toBe(saved.id);
  expect(sent.name).toBe(saved.name);
  expect(sent.floors).toEqual(saved.floors);
};

test('Export, Send this plan hands one plan file to the share sheet', async ({ page }) => {
  await stubShare(page);
  await openPlan(page, PLAN);
  const saved = await savedPlan(page);
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const first = page.locator('[data-popup="menu"]').getByRole('button').first();
  await expect(first).toHaveText('Send this plan');
  await first.click();
  await expect.poll(() => page.evaluate(() => (window as any).__shared.length)).toBe(1);
  const [shared] = await page.evaluate(() => (window as any).__shared);
  expect(shared.title).toBe('Room with boxes');
  expect(shared.files).toHaveLength(1);
  expect(shared.files[0].name).toBe('Room with boxes.openplan.json');
  expect(shared.files[0].type).toBe('application/json');
  sameRoom(JSON.parse(shared.files[0].text), saved);
});

test('without a share sheet, Send this plan downloads the plan file', async ({ page }) => {
  await noShare(page);
  await openPlan(page, PLAN);
  const saved = await savedPlan(page);
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Send this plan', exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('Room with boxes.openplan.json');
  sameRoom(JSON.parse(await readFile((await file.path())!, 'utf8')), saved);
});

test.describe('on a touch screen', () => {
  test.use(ipadLandscape);

  test('Send this plan is second in the more menu', async ({ page }) => {
    await stubShare(page);
    await openPlan(page, PLAN);
    await page.getByRole('button', { name: 'More actions', exact: true }).click();
    const second = page.locator('[data-popup="menu"]').getByRole('button').nth(1);
    await expect(second).toHaveText('Send this plan');
    await second.click();
    await expect.poll(() => page.evaluate(() => (window as any).__shared.length)).toBe(1);
  });
});
