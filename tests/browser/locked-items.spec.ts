import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

// A locked piece, symbol and text label cannot be deleted or dragged. Select All plus the lock
// shortcut is how they are unlocked again, and one Undo reverts each step.
async function openLockedPlan(page: Page, stacked = false) {
  await page.addInitScript(() => {
    localStorage.setItem('o3d_tips_seen', JSON.stringify(['first-wall', 'first-furniture', 'first-3d', 'first-export', 'first-door']));
    // Record where the label is painted, to press on it.
    const fill = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function(text, x, y, maxWidth) {
      if (text === 'PARK' && this.canvas.getAttribute('aria-label') === 'Floor plan editor canvas') {
        const p = new DOMPoint(x, y).matrixTransform(this.getTransform()), b = this.canvas.getBoundingClientRect();
        (window as any).__label = { x: b.x + p.x * b.width / this.canvas.width, y: b.y + p.y * b.height / this.canvas.height };
      }
      if (maxWidth === undefined) return fill.call(this, text, x, y);
      return fill.call(this, text, x, y, maxWidth);
    };
  });
  const plan = JSON.parse(await readFile('tests/fixtures/connected-dimensions.openplan.json', 'utf8')), floor = plan.floors[0];
  for (const key of ['walls', 'doors', 'windows', 'rooms', 'stairs', 'columns']) floor[key] = [];
  floor.furniture = [
    { id: 'piece', catalogId: 'sofa', position: { x: 0, y: 0 }, rotation: 0, scale: { x: 1, y: 1, z: 1 }, locked: true },
    { id: 'free', catalogId: 'sofa', position: { x: 0, y: 300 }, rotation: 0, scale: { x: 1, y: 1, z: 1 } },
  ];
  floor.entourage = [{ id: 'symbol', defId: 'person', position: { x: 300, y: 0 }, width: 100, rotation: 0, locked: true }];
  floor.textAnnotations = [{ id: 'label', text: 'PARK', x: 300, y: 300, fontSize: 40, rotation: 0, color: '#111111', locked: true }];
  // Stacked: the locked symbol and the unlocked piece lie under the locked label.
  if (stacked) floor.furniture[1].position = floor.entourage[0].position = { x: 300, y: 300 };
  await page.goto('/editor');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import JSON', exact: true }).click();
  await (await chooser).setFiles({ name: 'locked.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(plan)) });
  await expect(page.getByRole('button', { name: plan.name, exact: true })).toBeVisible();
}

async function exported(page: Page) {
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download JSON', exact: true }).click();
  return JSON.parse(await readFile((await (await pending).path())!, 'utf8')).floors[0];
}

// The view fits the plan after the label's first paint, so wait until its painted position settles.
async function labelPoint(page: Page): Promise<{ x: number; y: number }> {
  let last = '';
  await expect.poll(async () => {
    const now = JSON.stringify(await page.evaluate(() => (window as any).__label));
    const settled = now !== undefined && now === last;
    last = now;
    return settled;
  }).toBe(true);
  return JSON.parse(last);
}

const ids = (items: { id: string }[] = []) => items.map(item => item.id).sort();

test('locked pieces, symbols and text labels survive Delete and dragging, and unlock with Select All', async ({ page }) => {
  test.setTimeout(90_000);
  await openLockedPlan(page);
  const save = page.getByRole('button', { name: 'Save', exact: true });

  // Delete on a mixed selection removes only the unlocked piece; one Undo brings it back.
  await save.press('ControlOrMeta+a');
  await save.press('Delete');
  let floor = await exported(page);
  expect(ids(floor.furniture)).toEqual(['piece']);
  expect(ids(floor.entourage)).toEqual(['symbol']);
  expect(ids(floor.textAnnotations)).toEqual(['label']);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  floor = await exported(page);
  expect(ids(floor.furniture)).toEqual(['free', 'piece']);

  // A locked label does not move when dragged, and the export keeps its lock.
  await save.press('ControlOrMeta+d');
  const label = await labelPoint(page);
  await page.mouse.move(label.x, label.y);
  await page.mouse.down();
  await page.mouse.move(label.x + 80, label.y + 60, { steps: 6 });
  await page.mouse.up();
  floor = await exported(page);
  expect(floor.textAnnotations[0]).toMatchObject({ x: 300, y: 300, locked: true });
  // A press-and-drag on the label passes through it: the selection box it draws, clear of the label's point, selects nothing.
  await save.press('ControlOrMeta+d');
  await expect(page.locator('[data-plan-properties]')).toBeHidden();
  await page.mouse.move(label.x + 20, label.y);
  await page.mouse.down();
  await page.mouse.move(label.x + 100, label.y + 60, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator('[data-plan-properties]')).toBeHidden();
  floor = await exported(page);
  expect(floor.textAnnotations[0]).toMatchObject({ x: 300, y: 300, locked: true });

  // Locking everything hides every Delete button; the lock shortcut again unlocks all of them.
  await save.press('ControlOrMeta+a');
  await save.press('ControlOrMeta+l');
  await expect(page.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
  await save.press('Delete');
  floor = await exported(page);
  expect(ids(floor.furniture)).toEqual(['free', 'piece']);
  await save.press('ControlOrMeta+a');
  await save.press('ControlOrMeta+l');
  floor = await exported(page);
  expect([...floor.furniture, ...floor.entourage, ...floor.textAnnotations].every((item: any) => item.locked === false)).toBe(true);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  floor = await exported(page);
  expect([...floor.furniture, ...floor.entourage, ...floor.textAnnotations].every((item: any) => item.locked === true)).toBe(true);
});

test('a plain click reaches what is unlocked under a locked item, and the locked item when nothing else is there', async ({ page }) => {
  test.setTimeout(90_000);
  await openLockedPlan(page, true);
  const save = page.getByRole('button', { name: 'Save', exact: true });
  const label = await labelPoint(page);
  // The click lands on the unlocked piece under the locked label and symbol: Delete removes only it.
  await page.mouse.click(label.x, label.y);
  await expect(page.locator('[data-plan-properties]')).toBeVisible();
  await save.press('Delete');
  let floor = await exported(page);
  expect(ids(floor.furniture)).toEqual(['piece']);
  expect(ids(floor.entourage)).toEqual(['symbol']);
  expect(ids(floor.textAnnotations)).toEqual(['label']);
  // With only locked items under the pointer, a click selects the topmost of them, the label; Delete still removes nothing.
  const again = await labelPoint(page);
  await page.mouse.click(again.x, again.y);
  const panel = page.locator('[data-plan-properties]');
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('heading', { name: 'Text label' })).toBeVisible();
  await save.press('Delete');
  floor = await exported(page);
  expect(ids(floor.textAnnotations)).toEqual(['label']);
  expect(ids(floor.entourage)).toEqual(['symbol']);
  expect(ids(floor.furniture)).toEqual(['piece']);
});

test('a click on a locked piece alone selects it, and a drag from it moves nothing', async ({ page }) => {
  test.setTimeout(90_000);
  await openLockedPlan(page);
  const opened = await exported(page);
  await page.keyboard.press('Escape');
  // The label is painted at plan (300, 300) and the locked piece stands at (0, 0); zoom is screen px per plan cm.
  const label = await labelPoint(page);
  const percent = Number.parseFloat((await page.getByRole('button', { name: 'Zoom to 100%', exact: true }).textContent()) ?? '');
  const zoom = percent / 100;
  const piece = { x: label.x - 300 * zoom, y: label.y - 300 * zoom };
  const panel = page.locator('[data-plan-properties]');

  await page.mouse.click(piece.x, piece.y);
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('heading', { name: /sofa/i })).toBeVisible();

  await page.getByRole('button', { name: 'Save', exact: true }).press('ControlOrMeta+d');
  await expect(panel).toBeHidden();
  await page.mouse.move(piece.x, piece.y);
  await page.mouse.down();
  await page.mouse.move(piece.x + 80, piece.y, { steps: 6 });
  await page.mouse.up();
  const after = await exported(page);
  expect(after.furniture).toEqual(opened.furniture);
  expect(after.entourage).toEqual(opened.entourage);
  expect(after.textAnnotations).toEqual(opened.textAnnotations);
});
