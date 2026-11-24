import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// A plan file opened the moment the editor appears is the plan saved in the list,
// not only the plan on screen.
const fixture = resolve('tests/fixtures/native-import.openplan.json');

test.use({ viewport: { width: 1440, height: 900 } });

for (const [timer, shorten] of [['as it is', false], ['with its save timer at 50 ms', true]] as const) {
  test(`a plan file opened in the editor's first second is in the list of plans, ${timer}`, async ({ page }) => {
    const source = JSON.parse(await readFile(fixture, 'utf8'));
    await page.addInitScript(shorten => {
      localStorage.setItem('hasSeenWelcome', 'true');
      if (!shorten) return;
      // Save sooner than the editor's 1,000 ms, so a save lands inside the opening.
      const timeout = window.setTimeout.bind(window);
      window.setTimeout = ((handler: TimerHandler, delay?: number, ...args: any[]) =>
        timeout(handler, delay === 1000 ? 50 : delay, ...args)) as typeof window.setTimeout;
    }, shorten);
    await page.goto('/editor');
    await expect(page.locator('[data-bar="top"]')).toBeVisible();
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const pending = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Import JSON', exact: true }).click();
    await (await pending).setFiles(fixture);
    await expect(page.getByTitle('Click to rename', { exact: true })).toHaveText(source.name);
    await expect(page.getByText('Saved ✓', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Projects', exact: true }).click();
    await expect(page.getByRole('link', { name: source.name, exact: true })).toBeVisible();
  });
}
