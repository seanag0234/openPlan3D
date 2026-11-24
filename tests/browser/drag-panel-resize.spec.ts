import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

// Pressing an unselected piece selects it, which opens the properties panel beside the canvas and
// narrows it. The piece must still follow the pointer: a 60 px drag straight down moves it 60 px
// down and not sideways by half the panel's width.
const travel = 60;

async function openPlan(page: Page, viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport);
  await page.addInitScript(() => {
    localStorage.setItem('o3d_tips_seen', JSON.stringify(['first-wall', 'first-furniture', 'first-3d', 'first-export', 'first-door']));
    // Record where the two reference notes are painted, to turn plan centimetres into page pixels.
    const fill = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function(text, x, y, maxWidth) {
      if ((text === 'Map A' || text === 'Map B') && this.canvas.getAttribute('aria-label') === 'Floor plan editor canvas') {
        const p = new DOMPoint(x, y).matrixTransform(this.getTransform()), b = this.canvas.getBoundingClientRect();
        ((window as any).__map ??= {})[text] = { x: b.x + p.x * b.width / this.canvas.width, y: b.y + p.y * b.height / this.canvas.height, width: b.width };
      }
      if (maxWidth === undefined) return fill.call(this, text, x, y);
      return fill.call(this, text, x, y, maxWidth);
    };
  });
  const plan = JSON.parse(await readFile('tests/fixtures/connected-dimensions.openplan.json', 'utf8'));
  const floor = plan.floors[0];
  floor.doors = []; floor.windows = [];
  floor.furniture = [{ id: 'piece', catalogId: 'sofa', position: { x: 300, y: 150 }, rotation: 0, scale: { x: 1, y: 1, z: 1 } }];
  floor.textAnnotations = [
    { id: 'a', text: 'Map A', x: -500, y: -500, fontSize: 10, rotation: 0, color: '#555555' },
    { id: 'b', text: 'Map B', x: 500, y: -500, fontSize: 10, rotation: 0, color: '#555555' },
  ];
  await page.goto('/editor');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import JSON', exact: true }).click();
  await (await chooser).setFiles({ name: 'drag-panel.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(plan)) });
  await expect(page.getByRole('button', { name: plan.name, exact: true })).toBeVisible();
  // Below 1280 px the Snap to Grid switch lives in the More menu.
  if (viewport.width < 1280) await page.getByRole('button', { name: 'More actions', exact: true }).click();
  await page.getByRole('button', { name: /Move in steps/ }).click();
  await expect(page.locator('button[aria-label="Move in steps"]')).toHaveAttribute('aria-pressed', 'false');
  if (viewport.width < 1280) await page.getByRole('button', { name: 'More actions', exact: true }).click();
  await expect(page.locator('[data-plan-properties]')).toBeHidden();
  await settle(page);
  const { origin, zoom } = await page.evaluate(() => {
    const a = (window as any).__map['Map A'], b = (window as any).__map['Map B'];
    return { origin: { x: a.x, y: a.y }, zoom: (b.x - a.x) / 1000 };
  });
  return { zoom, piece: { x: origin.x + (300 + 500) * zoom, y: origin.y + (150 + 500) * zoom } };
}

function settle(page: Page) {
  return page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

async function exportedPiece(page: Page) {
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download JSON', exact: true }).click();
  return JSON.parse(await readFile((await (await pending).path())!, 'utf8')).floors[0].furniture[0];
}

function expectMovedStraightDown(piece: { position: { x: number; y: number } }, zoom: number) {
  // Pointer events land on whole pixels, so allow two pixels of rounding.
  expect(Math.abs(piece.position.x - 300)).toBeLessThan(2 / zoom);
  expect(Math.abs(piece.position.y - (150 + travel / zoom))).toBeLessThan(2 / zoom);
}

test('a mouse drag on an unselected piece follows the pointer while the panel opens', async ({ page }) => {
  test.setTimeout(90_000);
  const { zoom, piece } = await openPlan(page, { width: 1440, height: 900 });
  await page.mouse.move(piece.x, piece.y);
  await page.mouse.down();
  await expect(page.locator('[data-plan-properties]')).toBeVisible();
  await settle(page);
  await page.mouse.move(piece.x, piece.y + travel, { steps: 6 });
  await page.mouse.up();
  expectMovedStraightDown(await exportedPiece(page), zoom);
});

test('a touch drag on an unselected piece follows the finger while the panel opens', async ({ page }) => {
  test.setTimeout(90_000);
  const { zoom, piece } = await openPlan(page, { width: 1194, height: 834 });
  const canvas = page.getByLabel('Floor plan editor canvas', { exact: true });
  const touch = (type: string, x: number, y: number) => canvas.evaluate((node, { type, x, y }) => {
    const point = [{ identifier: 0, target: node, clientX: x, clientY: y }];
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(event, { touches: { value: type === 'touchend' ? [] : point }, changedTouches: { value: point } });
    node.dispatchEvent(event);
  }, { type, x, y });
  await touch('touchstart', piece.x, piece.y);
  // A finger presses nothing until it has moved past the 10 px slop: the second step starts the drag.
  for (let step = 1; step <= 2; step++) await touch('touchmove', piece.x, piece.y + travel * step / 6);
  await expect(page.locator('[data-plan-properties]')).toBeVisible();
  await settle(page);
  for (let step = 3; step <= 6; step++) await touch('touchmove', piece.x, piece.y + travel * step / 6);
  await touch('touchend', piece.x, piece.y + travel);
  expectMovedStraightDown(await exportedPiece(page), zoom);
});
