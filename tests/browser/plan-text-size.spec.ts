import { expect, test, type Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { openPlan } from './touch';

// Every text the plan draws, the ruler's numbers and the hints shown while a piece is dragged included,
// is 12 px or more, and the ruler in feet writes whole feet without a decimal point.
const FIXTURE = 'tests/fixtures/room-with-boxes.openplan.json';

interface Drawn { text: string; x: number; y: number; px: number; left: number; width: number; ruler: 'top' | 'left' | null }

/** Records each frame's fillText on the plan canvas in screen px, with its measured width and whether it lies in a ruler strip. */
async function recordTexts(page: Page) {
  await page.addInitScript(() => {
    const w = window as any;
    w.__drawn = [];
    const isPlan = (c: CanvasRenderingContext2D) => c.canvas instanceof HTMLCanvasElement && c.canvas.getAttribute('aria-label') === 'Floor plan editor canvas';
    const clear = CanvasRenderingContext2D.prototype.clearRect;
    CanvasRenderingContext2D.prototype.clearRect = function (x, y, width, height) {
      if (isPlan(this) && x <= 0 && y <= 0 && width >= this.canvas.width && height >= this.canvas.height) w.__drawn = [];
      return clear.call(this, x, y, width, height);
    };
    const fill = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
      if (isPlan(this)) {
        const m = this.getTransform(), p = new DOMPoint(x, y).matrixTransform(m), b = this.canvas.getBoundingClientRect();
        const toScreen = b.width / this.canvas.width, scale = Math.hypot(m.a, m.b) * toScreen;
        const size = Number(/([\d.]+)px/.exec(this.font)?.[1] ?? 0);
        const width = this.measureText(String(text)).width * scale;
        const sx = p.x * toScreen, sy = p.y * toScreen, rotated = Math.abs(m.b) > 1e-6;
        const shift = this.textAlign === 'center' ? width / 2 : this.textAlign === 'right' || this.textAlign === 'end' ? width : 0;
        // The rulers are the 24 px strips along the top and the left of the canvas.
        const ruler = !rotated && sy < 24 && sx > 24 ? 'top' : rotated && sx < 24 && sy > 24 ? 'left' : null;
        w.__drawn.push({ text: String(text), x: b.x + sx, y: b.y + sy, px: size * scale, left: b.x + sx - shift, width, ruler });
      }
      return maxWidth === undefined ? fill.call(this, text, x, y) : fill.call(this, text, x, y, maxWidth);
    };
  });
}

const frame = (page: Page) => page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
const drawn = (page: Page): Promise<Drawn[]> => page.evaluate(() => [...((window as any).__drawn ?? [])]);

/** The latest frame's texts, once two frames in a row agree. */
async function settled(page: Page): Promise<Drawn[]> {
  let last = '';
  let now: Drawn[] = [];
  await expect.poll(async () => {
    await frame(page);
    now = await drawn(page);
    const key = JSON.stringify(now.map(t => [t.text, Math.round(t.x), Math.round(t.y)]));
    const same = now.length > 0 && key === last;
    last = key;
    return same;
  }).toBe(true);
  return now;
}

function expectReadable(texts: Drawn[], moment: string) {
  expect(texts.filter(t => t.px < 11.99).map(t => `${t.text} at ${t.px.toFixed(1)} px`), moment).toEqual([]);
  const ruler = texts.filter(t => t.ruler);
  expect(ruler.filter(t => t.text.includes('.')).map(t => t.text), moment).toEqual([]);
  expect(ruler.some(t => /^-?\d+'$/.test(t.text)), `${moment}: a whole foot on the ruler`).toBe(true);
  const top = ruler.filter(t => t.ruler === 'top').sort((a, b) => a.left - b.left);
  for (let i = 1; i < top.length; i++) {
    expect(top[i - 1].left + top[i - 1].width, `${moment}: "${top[i - 1].text}" clear of "${top[i].text}"`).toBeLessThanOrEqual(top[i].left);
  }
}

test('the plan draws no text under 12 px and the ruler writes whole feet', async ({ page }) => {
  test.setTimeout(90_000);
  const plan = JSON.parse(await readFile(FIXTURE, 'utf8'));
  plan.displaySettings = { units: 'imperial' };
  const file = test.info().outputPath('feet.openplan.json');
  await writeFile(file, JSON.stringify(plan));
  await recordTexts(page);
  await openPlan(page, file);
  await page.keyboard.press('Escape');

  expectReadable(await settled(page), 'after the plan opens');

  // Hold Box A by its name, which is drawn on it, and drag it partway.
  let texts = await settled(page);
  const boxA = texts.find(t => t.text === 'Box A')!;
  const press: [number, number] = [boxA.x, boxA.y];

  await page.mouse.move(...press);
  await page.mouse.down();
  await page.mouse.move(press[0] + 20, press[1] + 10, { steps: 4 });
  await page.mouse.move(press[0] + 40, press[1] + 20, { steps: 4 });
  texts = await settled(page);
  expect(texts.length, 'texts drawn mid-drag').toBeGreaterThan(0);
  expectReadable(texts, 'while a box is dragged');
  await page.mouse.up();

  // Zoom out as far as the "−" button goes.
  const percent = page.getByRole('button', { name: 'Zoom to 100%', exact: true });
  const zoomOut = page.getByRole('button', { name: 'Zoom out', exact: true });
  for (let i = 0; i < 40; i++) {
    const before = await percent.textContent();
    if (await zoomOut.isDisabled()) break;
    await zoomOut.click();
    await frame(page);
    if ((await percent.textContent()) === before) break;
  }
  expectReadable(await settled(page), 'at the smallest zoom');
});
