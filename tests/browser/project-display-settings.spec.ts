import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

// A plan file can carry its display choices. A fresh browser that imports it shows feet and no wall
// lengths, and a downloaded copy carries the same choices back out.
const displaySettings = { units: 'imperial', showDimensions: false };

async function exported(page: Page) {
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download JSON', exact: true }).click();
  return JSON.parse(await readFile((await (await pending).path())!, 'utf8'));
}

test('an imported plan sets units and wall lengths for a fresh browser and exports them again', async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    localStorage.setItem('o3d_tips_seen', JSON.stringify(['first-wall', 'first-furniture', 'first-3d', 'first-export', 'first-door']));
    // Collect the canvas text of each frame: 9 px ruler ticks and every other label.
    const fill = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function(text, x, y, maxWidth) {
      if (this.canvas.getAttribute('aria-label') === 'Floor plan editor canvas') ((window as any).__texts ??= []).push({ text: String(text), ruler: this.font.startsWith('9px') });
      if (maxWidth === undefined) return fill.call(this, text, x, y);
      return fill.call(this, text, x, y, maxWidth);
    };
  });
  const plan = JSON.parse(await readFile('tests/fixtures/connected-dimensions.openplan.json', 'utf8'));
  plan.displaySettings = displaySettings;
  await page.goto('/editor');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import JSON', exact: true }).click();
  await (await chooser).setFiles({ name: 'display.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(plan)) });
  await expect(page.getByRole('button', { name: plan.name, exact: true })).toBeVisible();

  // Repaint from scratch, then read what was drawn.
  await page.evaluate(() => { (window as any).__texts = []; });
  await page.getByTitle('Zoom to Fit (F)', { exact: true }).first().press('Enter');
  await expect.poll(() => page.evaluate(() => ((window as any).__texts ?? []).some((t: any) => t.ruler))).toBe(true);
  const texts: { text: string; ruler: boolean }[] = await page.evaluate(() => (window as any).__texts);
  const feet = /\d+'/;
  expect(texts.some(t => t.ruler && feet.test(t.text))).toBe(true);
  expect(texts.filter(t => !t.ruler && feet.test(t.text))).toEqual([]);

  await page.getByRole('button', { name: 'Save', exact: true }).press('l');
  await page.getByRole('button', { name: '─ Wall 1', exact: true }).click();
  await expect(page.getByLabel('Length (in)', { exact: true })).toBeVisible();

  const first = await exported(page);
  expect(first.displaySettings).toMatchObject(displaySettings);
  const second = await exported(page);
  expect(second.displaySettings).toEqual(first.displaySettings);
});
