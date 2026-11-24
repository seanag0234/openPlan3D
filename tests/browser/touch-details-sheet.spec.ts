import { expect, test, type Page } from '@playwright/test';
import { fingers, ipadLandscape, ipadPortrait, openPlan, recordLabels, where } from './touch';

const FIXTURE = 'tests/fixtures/room-with-boxes.openplan.json';
/** A point on the piece itself: its caption is drawn just under it. */
const onPiece = (caption: { x: number; y: number }) => ({ x: caption.x, y: caption.y - 24 });
const canvasBox = async (page: Page) => (await page.getByLabel('Floor plan editor canvas', { exact: true }).boundingBox())!;

for (const [name, device] of [['landscape', ipadLandscape], ['portrait', ipadPortrait]] as const) {
  test.describe(`an iPad held ${name}`, () => {
    test.use(device);

    test('a tap selects without covering the plan, and Details opens a sheet that keeps the piece in view', async ({ page }) => {
      const hand = await fingers(page);
      await recordLabels(page);
      await openPlan(page, FIXTURE);
      await page.keyboard.press('Escape');
      const panel = page.locator('[data-plan-properties]');
      const before = await canvasBox(page);
      const b = onPiece(await where(page, 'Box B'));
      await hand.tap(b.x, b.y);
      const details = page.getByRole('button', { name: 'Details', exact: true });
      await expect(details).toBeVisible();
      await expect(panel).toBeHidden();
      expect((await canvasBox(page)).width).toBe(before.width);

      await details.tap();
      await expect(panel).toBeVisible();
      expect((await canvasBox(page)).width).toBe(before.width);
      const sheet = (await panel.boundingBox())!;
      const shown = await where(page, 'Box B');
      if (name === 'landscape') expect(shown.x).toBeLessThan(sheet.x - 8);
      else expect(shown.y).toBeLessThan(sheet.y - 8);
      expect(shown.x).toBeGreaterThan(before.x);
      expect(shown.y).toBeGreaterThan(before.y);

      const done = panel.getByRole('button', { name: 'Done', exact: true });
      expect((await done.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await done.tap();
      await expect(panel).toBeHidden();
    });
  });
}

test('with a mouse, the details panel opens on selection as before', async ({ page }) => {
  await recordLabels(page);
  await openPlan(page, FIXTURE);
  await page.keyboard.press('Escape');
  const b = await where(page, 'Box B');
  await page.mouse.click(b.x, b.y);
  await expect(page.locator('[data-plan-properties]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Details', exact: true })).toHaveCount(0);
});

test.describe('the list of things to add on an upright iPad', () => {
  test.use(ipadPortrait);

  test('starts folded so the plan keeps its width, and Add brings it back', async ({ page }) => {
    const hand = await fingers(page);
    await recordLabels(page);
    await openPlan(page, FIXTURE);
    await page.keyboard.press('Escape');
    expect((await canvasBox(page)).width).toBeGreaterThanOrEqual(780);
    const objects = page.getByRole('button', { name: 'Things', exact: true });
    await expect(objects).toBeHidden();

    const a = onPiece(await where(page, 'Box A'));
    await hand.tap(a.x, a.y);
    await expect(page.getByRole('button', { name: 'Details', exact: true })).toBeVisible();
    expect((await canvasBox(page)).width).toBeGreaterThanOrEqual(780);

    await page.getByRole('button', { name: 'Add', exact: true }).tap();
    await expect(objects).toBeVisible();
    const hide = page.getByRole('button', { name: 'Hide the list', exact: true });
    expect((await hide.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await hide.tap();
    await expect(objects).toBeHidden();
    expect((await canvasBox(page)).width).toBeGreaterThanOrEqual(780);
  });
});


test.describe('help on a touch screen', () => {
  test.use(ipadLandscape);

  test('speaks of fingers, not keys', async ({ page }) => {
    await openPlan(page, FIXTURE);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Help', exact: true }).tap();
    const card = page.getByRole('dialog', { name: 'Using your fingers', exact: true });
    await expect(card).toBeVisible();
    for (const line of ['Tap a thing to pick it.', 'Drag it to move it.', 'Two fingers zoom and slide the plan.',
      'One finger on empty paper slides the plan.', 'Press and hold for more choices.', 'Done on a message ends what you were doing.']) {
      await expect(card).toContainText(line);
    }
    const text = await card.innerText();
    for (const key of ['Esc', 'Ctrl', 'Shift']) expect(text).not.toContain(key);
    await card.getByRole('button', { name: 'Done', exact: true }).tap();
    await expect(card).toBeHidden();
  });
});

test('with a mouse, ? still opens the keyboard shortcuts', async ({ page }) => {
  await openPlan(page, FIXTURE);
  await page.getByRole('button', { name: 'Keyboard Shortcuts', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Keyboard Shortcuts' })).toContainText('Ctrl+Z');
});
