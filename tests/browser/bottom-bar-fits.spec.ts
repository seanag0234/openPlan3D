import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { openPlan, recordLabels, where } from './touch';

// With a mouse, a selection opens the panel at the right and narrows the plan. The bottom bar then gives up
// counts, whole items at a time, rather than breaking its words onto two lines and growing under the zoom box.
const PLAN = 'tests/fixtures/room-with-boxes.openplan.json';

async function selectBoxA(page: Page) {
  const caption = await where(page, 'Box A');
  await page.mouse.click(caption.x, caption.y - 24);
  await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('Box A');
}

async function expectOneLine(page: Page) {
  const bar = page.locator('[data-bar="bottom"]');
  await expect(bar).toBeVisible();
  const read = await bar.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const buttons = [...element.querySelectorAll('button')].filter(button => button.checkVisibility()).map(button => {
      // Words that wrap inside a button sit on more than one line.
      const range = document.createRange();
      range.selectNodeContents(button);
      const lines = new Set([...range.getClientRects()].filter(r => r.width > 0).map(r => Math.round(r.top))).size;
      const box = button.getBoundingClientRect();
      return { text: button.textContent?.trim() ?? '', lines, left: box.left, right: box.right };
    });
    return { top: rect.top, left: rect.left, right: rect.right, height: rect.height, buttons };
  });
  for (const button of read.buttons) {
    expect(button.lines, `"${button.text}" lines`).toBeLessThanOrEqual(1);
    expect(button.left, `"${button.text}" left edge`).toBeGreaterThanOrEqual(read.left);
    expect(button.right, `"${button.text}" right edge`).toBeLessThanOrEqual(read.right);
  }
  expect(read.height).toBeLessThan(30);
  const zoom = (await page.locator('[data-bar="zoom"]').boundingBox())!;
  expect(zoom.y + zoom.height).toBeLessThanOrEqual(read.top);
}

for (const [width, height] of [[1440, 900], [1100, 800]] as const) {
  test(`with a mouse at ${width} px and a piece selected the bottom bar stays on one line`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await recordLabels(page);
    await openPlan(page, PLAN);
    await page.keyboard.press('Escape');
    await selectBoxA(page);
    await expect(page.locator('[data-plan-properties]')).toBeVisible();
    await expectOneLine(page);
  });
}

test('with a mouse at 1440 px and nothing selected the bottom bar still shows the counts', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openPlan(page, PLAN);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-bar="bottom"]').getByText(/walls$/)).toBeVisible();
  await expectOneLine(page);
});

test('in Portuguese with a mouse at 1440 px and a piece selected the bottom bar stays on one line', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => localStorage.setItem('o3d_locale', 'pt'));
  await page.addInitScript(() => {
    localStorage.setItem('o3d_tips_seen', JSON.stringify(['first-wall', 'first-furniture', 'first-3d', 'first-export', 'first-door']));
  });
  await page.goto('/editor');
  const text = await readFile(PLAN, 'utf8');
  await page.getByRole('button', { name: 'Exportar', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Importar JSON', exact: true }).click();
  await (await chooser).setFiles({ name: 'plan.openplan.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  await expect(page.getByRole('button', { name: JSON.parse(text).name, exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  // The label recorder knows the plan by its English name, so Box A is picked from the list of everything on the plan.
  const save = page.getByRole('button', { name: 'Salvar', exact: true });
  await save.press('l');
  await page.getByRole('button', { name: /Box A$/ }).first().click();
  await save.press('l');
  await expect(page.getByRole('button', { name: /Box A$/ })).toHaveCount(0);
  await expect(page.locator('[data-plan-properties]')).toBeVisible();
  await expectOneLine(page);
});
