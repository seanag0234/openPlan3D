import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { savedProjects } from './storage';
import { openList } from './list';

const fixture = resolve('tests/fixtures/room-with-boxes.openplan.json');

/** This copy names the made-up room as its starting plan. */
async function serveStartPlan(page: Page) {
  const body = await readFile(fixture, 'utf8');
  await page.route('**/api/start-plan*', route => {
    const info = new URL(route.request().url()).searchParams.has('info');
    return route.fulfill(info
      ? { status: 200, contentType: 'application/json', headers: { 'Cache-Control': 'no-store' }, body: JSON.stringify({ available: true }) }
      : { status: 200, contentType: 'application/json', headers: { 'Cache-Control': 'no-store' }, body });
  });
}

test('a copy without a starting plan shows the welcome as before', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Welcome', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('button', { name: 'Get the starting plan' })).toHaveCount(0);
});

test('the starting plan opens by itself on a first visit, once', async ({ page }) => {
  await serveStartPlan(page);
  await page.goto('/');
  await expect(page).toHaveURL(/\/editor\?id=room-with-boxes/);
  await expect(page.getByRole('button', { name: 'Room with boxes', exact: true })).toBeVisible();
  await expect.poll(async () => Object.keys(await savedProjects(page))).toEqual(['room-with-boxes']);

  // Back on the list, the starting plan can be had again: it is the same plan, not a second one.
  await openList(page);
  await expect(page.getByRole('heading', { name: 'Room with boxes' })).toBeVisible();
  await page.getByRole('button', { name: 'Get the starting plan' }).click();
  await expect(page).toHaveURL(/\/editor\?id=room-with-boxes/);
  await expect(page.getByRole('button', { name: 'Room with boxes', exact: true })).toBeVisible();
  expect(Object.keys(await savedProjects(page))).toEqual(['room-with-boxes']);

  // Deleted, it does not come back by itself.
  await openList(page);
  await page.getByRole('button', { name: 'Project actions for Room with boxes' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete project' }).click();
  await expect.poll(async () => Object.keys(await savedProjects(page))).toEqual([]);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Welcome', exact: true })).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page).toHaveURL(/\/$/);
  expect(Object.keys(await savedProjects(page))).toEqual([]);
});
