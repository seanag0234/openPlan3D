import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

// A name typed in a piece's panel is its caption on the plan, its Layers row and its panel heading,
// travels in the JSON and SVG exports, and one Undo removes it.
const name = 'Reading nook';

async function download(page: Page, button: string) {
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: button, exact: true }).click();
  return readFile((await (await pending).path())!, 'utf8');
}

test('a piece takes a name that shows as its caption, Layers row, heading and in exports', async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    localStorage.setItem('o3d_tips_seen', JSON.stringify(['first-wall', 'first-furniture', 'first-3d', 'first-export', 'first-door']));
    const fill = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function(text, x, y, maxWidth) {
      if (this.canvas.getAttribute('aria-label') === 'Floor plan editor canvas') (window as any).__captions = [...((window as any).__captions ?? []).slice(-200), String(text)];
      if (maxWidth === undefined) return fill.call(this, text, x, y);
      return fill.call(this, text, x, y, maxWidth);
    };
  });
  const plan = JSON.parse(await readFile('tests/fixtures/connected-dimensions.openplan.json', 'utf8')), floor = plan.floors[0];
  floor.doors = []; floor.windows = [];
  floor.furniture = [{ id: 'piece', catalogId: 'sofa', position: { x: 300, y: 200 }, rotation: 0, scale: { x: 1, y: 1, z: 1 } }];
  await page.goto('/editor');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import JSON', exact: true }).click();
  await (await chooser).setFiles({ name: 'named.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(plan)) });
  await expect(page.getByRole('button', { name: plan.name, exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Save', exact: true }).press('l');
  await page.getByRole('button', { name: /Sofa$/ }).click();
  const field = page.getByLabel('Name', { exact: true });
  await field.fill(name);
  await expect(page.getByRole('heading', { name: new RegExp(`${name}: details`) })).toBeVisible();
  await expect(page.getByRole('button', { name: new RegExp(`${name}$`) })).toBeVisible();
  await expect.poll(() => page.evaluate(n => ((window as any).__captions ?? []).includes(n), name)).toBe(true);

  const json = JSON.parse(await download(page, 'Download JSON'));
  expect(json.floors[0].furniture[0].name).toBe(name);
  expect(await download(page, 'Export as a drawing that scales (SVG)')).toContain(name);

  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  const undone = JSON.parse(await download(page, 'Download JSON'));
  expect(undone.floors[0].furniture[0]).not.toHaveProperty('name');
  await expect(page.getByRole('button', { name: /Sofa$/ })).toBeVisible();
});
