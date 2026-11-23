import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

// A locked piece, symbol and text label cannot be deleted or dragged. Select All plus the lock
// shortcut is how they are unlocked again, and one Undo reverts each step.
async function openLockedPlan(page: Page) {
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
  await expect.poll(() => page.evaluate(() => !!(window as any).__label)).toBe(true);
  const label = await page.evaluate(() => (window as any).__label);
  await page.mouse.move(label.x, label.y);
  await page.mouse.down();
  await page.mouse.move(label.x + 80, label.y + 60, { steps: 6 });
  await page.mouse.up();
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
