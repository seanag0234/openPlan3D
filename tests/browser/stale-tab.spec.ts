import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { recordLabels, where } from './touch';
import { mouseDrag, openStored, stored } from './saving';

test.use({ viewport: { width: 1366, height: 900 } });

async function rename(page: Page, name: string) {
  await page.getByTitle('Click to rename', { exact: true }).click();
  await page.getByRole('textbox', { name: 'Project name' }).fill(name);
  await page.getByRole('textbox', { name: 'Project name' }).press('Enter');
}
const comeBack = (page: Page) => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
const bar = (page: Page) => page.getByRole('alert').filter({ hasText: 'another tab' });

async function twoTabs(context: BrowserContext, first: Page) {
  await recordLabels(first);
  const plan = await openStored(first);
  const second = await context.newPage();
  await recordLabels(second);
  await second.goto(first.url());
  await expect(second.getByRole('button', { name: plan.name, exact: true })).toBeVisible();
  return { plan, second };
}

test('a tab with no change of its own shows the plan another tab saved when it comes back', async ({ page, context }) => {
  const { plan, second } = await twoTabs(context, page);
  await rename(page, 'Renamed in the first tab');
  await expect(page.getByText('Saved ✓')).toBeVisible();
  await expect(bar(second)).toBeVisible();

  await comeBack(second);
  await expect(second.getByTitle('Click to rename', { exact: true })).toHaveText('Renamed in the first tab');
  await expect(bar(second)).toHaveCount(0);
  await expect(second.getByRole('status').filter({ hasText: 'This plan was changed in another tab. You are now looking at the newest one.' })).toBeVisible();

  await mouseDrag(second, await where(second, 'Box A'), 100);
  await expect.poll(async () => (await stored(second, plan.id)).floors[0].furniture.find((item: any) => item.id === 'box-a').position.x).toBeGreaterThan(150);
  expect((await stored(second, plan.id)).name).toBe('Renamed in the first tab');
  await expect(bar(second)).toHaveCount(0);
});

test('a tab with a change of its own keeps it and the bar when it comes back', async ({ page, context }) => {
  // Hold every save back until Save is pressed.
  await context.addInitScript(() => {
    const timeout = window.setTimeout.bind(window);
    window.setTimeout = ((handler: TimerHandler, delay?: number, ...args: any[]) =>
      timeout(handler, delay === 1000 ? 60_000 : delay, ...args)) as typeof window.setTimeout;
  });
  const { second } = await twoTabs(context, page);
  await rename(second, 'Second tab name');
  await rename(page, 'First tab name');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved ✓')).toBeVisible();
  await expect(bar(second)).toBeVisible();

  await comeBack(second);
  await expect(bar(second)).toBeVisible();
  await expect(bar(second).getByRole('button', { name: 'Save as copy', exact: true })).toBeVisible();
  await expect(second.getByTitle('Click to rename', { exact: true })).toHaveText('Second tab name');
});
