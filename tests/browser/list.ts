import { expect, type Page } from '@playwright/test';

/**
 * Open the list of plans and wait until its own code runs. The server draws the list, so its buttons are on
 * screen before the page's code has attached to them, and a press in that gap does nothing. Only the running
 * page replaces the loading line under the heading with a count, or puts up the first-visit welcome.
 */
export async function openList(page: Page): Promise<void> {
  await page.goto('/');
  const count = page.getByText(/^\d+ projects?$/);
  const welcome = page.getByRole('heading', { name: 'Welcome', exact: true });
  await expect(count.or(welcome).first()).toBeVisible();
  await expect(page.getByText('Loading projects…', { exact: true })).toHaveCount(0);
}
