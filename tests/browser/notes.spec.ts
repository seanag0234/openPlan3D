import { expect, test, type Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { fingers, ipadLandscape, openPlan, recordLabels, savedPlan, where } from './touch';

const FIXTURE = 'tests/fixtures/room-with-boxes.openplan.json';
const boxA = (plan: any) => plan.floors[0].furniture.find((item: any) => item.id === 'box-a');

/** Record the note marks drawn on the plan (circles of radius 9), in page px, frame by frame. */
async function recordMarks(page: Page) {
  await page.addInitScript(() => {
    const w = window as any;
    w.__marks = [];
    const isPlan = (c: CanvasRenderingContext2D) => c.canvas instanceof HTMLCanvasElement && c.canvas.getAttribute('aria-label') === 'Floor plan editor canvas';
    const clear = CanvasRenderingContext2D.prototype.clearRect;
    CanvasRenderingContext2D.prototype.clearRect = function (x, y, width, height) {
      if (isPlan(this) && x <= 0 && y <= 0 && width >= this.canvas.width && height >= this.canvas.height) w.__marks = [];
      return clear.call(this, x, y, width, height);
    };
    const arc = CanvasRenderingContext2D.prototype.arc;
    CanvasRenderingContext2D.prototype.arc = function (x, y, radius, start, end, ccw) {
      if (isPlan(this) && radius === 9) {
        const p = new DOMPoint(x, y).matrixTransform(this.getTransform()), b = this.canvas.getBoundingClientRect();
        w.__marks.push({ x: b.x + p.x * b.width / this.canvas.width, y: b.y + p.y * b.height / this.canvas.height });
      }
      return arc.call(this, x, y, radius, start, end, ccw);
    };
  });
}
const marks = (page: Page): Promise<{ x: number; y: number }[]> =>
  page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve([...(window as any).__marks])))));

/** The room with boxes, with a note already on Box A. */
async function openNoted(page: Page, file: string, note: string | null = 'check this size') {
  const plan = JSON.parse(await readFile(FIXTURE, 'utf8'));
  if (note) boxA(plan).details = { note };
  await writeFile(file, JSON.stringify(plan));
  await recordLabels(page);
  await recordMarks(page);
  await openPlan(page, file);
  await page.keyboard.press('Escape');
}

for (const [name, device] of [['a mouse', {}], ['a finger', ipadLandscape]] as const) {
  test.describe(`with ${name}`, () => {
    test.use(device);

    test('a press on a note mark opens the note, and Done and Remove note save it', async ({ page }, testInfo) => {
      const touch = name === 'a finger';
      const hand = touch ? await fingers(page) : null;
      const press = (p: { x: number; y: number }) => hand ? hand.tap(p.x, p.y) : page.mouse.click(p.x, p.y);
      await openNoted(page, testInfo.outputPath('noted.openplan.json'));
      const caption = await where(page, 'Box A');
      await expect.poll(async () => (await marks(page)).length).toBe(1);
      const [mark] = await marks(page);
      expect(mark.x).toBeGreaterThan(caption.x);
      expect(mark.y).toBeLessThan(caption.y);

      await press(mark);
      const sheet = page.getByRole('dialog', { name: 'Box A', exact: true });
      await expect(sheet).toBeVisible();
      const text = sheet.getByRole('textbox');
      await expect(text).toHaveValue('check this size');
      await expect(text).toBeFocused();
      await text.press('End');
      await text.pressSequentially(' again');
      const done = sheet.getByRole('button', { name: 'Done', exact: true });
      expect((await done.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await done.click();
      await expect(sheet).toBeHidden();
      expect(boxA(await savedPlan(page)).details.note).toBe('check this size again');

      await page.keyboard.press('Escape');
      await press((await marks(page))[0]);
      await expect(text).toHaveValue('check this size again');
      await sheet.getByRole('button', { name: 'Remove note', exact: true }).click();
      await expect(sheet).toBeHidden();
      await expect.poll(async () => (await marks(page)).length).toBe(0);
      expect(boxA(await savedPlan(page)).details?.note ?? null).toBeNull();
    });

    test('Note on the bar leaves a note, which shows on the plan and in the list', async ({ page }, testInfo) => {
      const touch = name === 'a finger';
      const hand = touch ? await fingers(page) : null;
      const press = (p: { x: number; y: number }) => hand ? hand.tap(p.x, p.y) : page.mouse.click(p.x, p.y);
      const pressButton = (button: ReturnType<Page['getByRole']>) => touch ? button.tap() : button.click();
      await openNoted(page, testInfo.outputPath('plain.openplan.json'), null);
      const notes = page.getByRole('button', { name: 'Notes', exact: true });
      await expect(notes).toHaveAttribute('data-note-marks', '0');

      // Three presses from the plan to the text box: the piece, Note, the box.
      const caption = await where(page, 'Box A');
      await press({ x: caption.x, y: caption.y - 24 });
      await pressButton(page.getByRole('button', { name: 'Note', exact: true }));
      const sheet = page.getByRole('dialog', { name: 'Box A', exact: true });
      const text = sheet.getByRole('textbox');
      await pressButton(text);
      await expect(text).toBeFocused();
      await text.pressSequentially('measure the window');
      await pressButton(sheet.getByRole('button', { name: 'Done', exact: true }));
      await expect(sheet).toBeHidden();
      expect(boxA(await savedPlan(page)).details.note).toBe('measure the window');

      await page.keyboard.press('Escape');
      await expect(notes).toHaveAttribute('data-note-marks', '1');
      await expect.poll(async () => (await marks(page)).length).toBe(1);
      const [mark] = await marks(page);
      expect(mark.x).toBeGreaterThan(caption.x);
      expect(mark.y).toBeLessThan(caption.y);
      await press(mark);
      await expect(text).toHaveValue('measure the window');
      await pressButton(sheet.getByRole('button', { name: 'Done', exact: true }));

      await pressButton(notes);
      const list = page.getByRole('list', { name: 'Notes', exact: true });
      await expect(list.getByRole('listitem')).toHaveCount(2);
      await expect(list.getByRole('listitem').first()).toContainText('About this plan');
      const row = list.getByRole('button', { name: /Box A/ });
      await expect(row).toContainText('measure the window');
      await pressButton(row);
      await expect(list).toBeHidden();
      await expect(text).toHaveValue('measure the window');
      await pressButton(sheet.getByRole('button', { name: 'Remove note', exact: true }));
      await expect(sheet).toBeHidden();
      await expect(notes).toHaveAttribute('data-note-marks', '0');
      await page.keyboard.press('Escape');
      await expect.poll(async () => (await marks(page)).length).toBe(0);
      await pressButton(notes);
      await expect(list.getByRole('listitem')).toHaveCount(1);
      expect(boxA(await savedPlan(page)).details?.note ?? null).toBeNull();
    });
  });
}
