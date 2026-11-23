import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

// With Object Sizes on, a piece reads its name over its real footprint in 12 px text at any zoom.
// Turning the setting off brings back the old one-line caption.
test('a named piece shows its name and size in readable text, and the setting turns the size off', async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    localStorage.setItem('o3d_tips_seen', JSON.stringify(['first-wall', 'first-furniture', 'first-3d', 'first-export', 'first-door']));
    const fill = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function(text, x, y, maxWidth) {
      if (this.canvas.getAttribute('aria-label') === 'Floor plan editor canvas') {
        const w = window as any;
        w.__texts = [...(w.__texts ?? []).slice(-300), { text: String(text), font: this.font }];
      }
      if (maxWidth === undefined) return fill.call(this, text, x, y);
      return fill.call(this, text, x, y, maxWidth);
    };
  });
  const plan = JSON.parse(await readFile('tests/fixtures/connected-dimensions.openplan.json', 'utf8')), floor = plan.floors[0];
  floor.doors = []; floor.windows = [];
  floor.furniture = [{ id: 'table', catalogId: 'unknown-model', name: 'Lego table', position: { x: 300, y: 200 }, rotation: 0,
    scale: { x: 1, y: 1, z: 1 }, width: 121.92, depth: 91.44 }];
  await page.goto('/editor');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import JSON', exact: true }).click();
  await (await chooser).setFiles({ name: 'captions.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(plan)) });
  await expect(page.getByRole('button', { name: plan.name, exact: true })).toBeVisible();

  const fonts = (text: string) => page.evaluate(t => ((window as any).__texts ?? []).filter((d: any) => d.text === t).map((d: any) => d.font), text);
  const clear = () => page.evaluate(() => { (window as any).__texts = []; });
  const drawnAt12 = async (text: string) => expect.poll(async () => (await fonts(text)).at(-1)).toBe('12px sans-serif');

  for (const step of ['fit', 'zoomed']) {
    if (step === 'zoomed') {
      await clear();
      for (let i = 0; i < 3; i++) await page.getByTitle('Zoom In (+)', { exact: true }).first().click();
    }
    await drawnAt12('Lego table');
    await drawnAt12('1.22 m × 91 cm');
  }

  await page.getByRole('button', { name: 'Save', exact: true }).press('l');
  await page.getByRole('button', { name: /Lego table$/ }).click();
  const width = page.getByRole('spinbutton', { name: 'Width (cm)', exact: true });
  await width.fill('152.4');
  await width.press('Enter');
  await drawnAt12('1.52 m × 91 cm');

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
  await settings.getByRole('button', { name: 'Dimensions', exact: true }).click();
  // Clear before the toggle: it repaints the canvas once, and on WebKit that frame lands before uncheck() returns.
  await clear();
  await settings.getByRole('checkbox', { name: 'Object Sizes', exact: true }).uncheck();
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await fonts('Lego table')).length).toBeGreaterThan(0);
  expect(await fonts('Lego table')).not.toContain('12px sans-serif');
  expect(await fonts('1.52 m × 91 cm')).toEqual([]);
});
