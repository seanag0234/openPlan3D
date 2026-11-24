import { expect, test, type TestInfo } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { labels, openPlan, recordLabels, where } from './touch';

const FIXTURE = 'tests/fixtures/room-with-boxes.openplan.json';

/** A copy of the room with boxes, changed by `edit`, written where this test keeps its files. */
async function planWith(testInfo: TestInfo, edit: (plan: any) => void): Promise<string> {
  const plan = JSON.parse(await readFile(FIXTURE, 'utf8'));
  edit(plan);
  const file = testInfo.outputPath('plan.json');
  await writeFile(file, JSON.stringify(plan));
  return file;
}

const piece = (plan: any, id: string) => plan.floors[0].furniture.find((item: any) => item.id === id);

test('names and sizes of pieces close together do not run into each other', async ({ page }, testInfo) => {
  await recordLabels(page);
  // Box B stands over Box A, so each piece's own caption place lands on its neighbour's.
  await openPlan(page, await planWith(testInfo, plan => { piece(plan, 'box-b').position = { x: 160, y: 215 }; }));
  await page.keyboard.press('Escape');
  await where(page, 'Box A');
  await where(page, 'Box B');
  const drawn = (await labels(page)).filter(line => ['Box A', 'Box B', 'Rug'].includes(line.text) || line.text.includes(' × '));
  expect(drawn.map(line => line.text)).toEqual(expect.arrayContaining(['Box A', 'Box B']));
  const boxOf = (line: { text: string; x: number; y: number }) => {
    const half = line.text.length * 6.6 / 2;
    return { left: line.x - half, right: line.x + half, top: line.y - 7.5, bottom: line.y + 7.5 };
  };
  for (let i = 0; i < drawn.length; i++) for (let j = i + 1; j < drawn.length; j++) {
    const a = boxOf(drawn[i]), b = boxOf(drawn[j]);
    const across = Math.min(a.right, b.right) - Math.max(a.left, b.left), down = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    expect(across > 1 && down > 1, `"${drawn[i].text}" and "${drawn[j].text}" overlap`).toBe(false);
  }
});

test('a piece standing alone keeps its name and size where they were', async ({ page }) => {
  await recordLabels(page);
  await openPlan(page, FIXTURE);
  await page.keyboard.press('Escape');
  const name = await where(page, 'Box A');
  const size = (await labels(page)).find(line => line.text.includes(' × ') && Math.abs(line.x - name.x) < 0.5 && line.y > name.y);
  expect(size).toBeDefined();
  expect(size!.y - name.y).toBeCloseTo(15, 3);
});

test('a turned piece reads its name upright', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    const fill = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function(text, x, y, maxWidth) {
      if (this.canvas.getAttribute('aria-label') === 'Floor plan editor canvas' && text === 'Box A') {
        const t = this.getTransform();
        (window as any).__boxA = { b: t.b, c: t.c };
      }
      if (maxWidth === undefined) return fill.call(this, text, x, y);
      return fill.call(this, text, x, y, maxWidth);
    };
  });
  await openPlan(page, await planWith(testInfo, plan => { piece(plan, 'box-a').rotation = 90; }));
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => (window as any).__boxA ?? null)).not.toBeNull();
  const transform = await page.evaluate(() => (window as any).__boxA as { b: number; c: number });
  expect(transform.b).toBe(0);
  expect(transform.c).toBe(0);
});

test('zoomed far out, a row of small pieces draws no caption over another', async ({ page }, testInfo) => {
  await recordLabels(page);
  const names = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'].map(n => `Box number ${n}`);
  // Eight boxes 60 cm wide, 5 cm apart in one row, each with a name of a dozen letters.
  await openPlan(page, await planWith(testInfo, plan => {
    plan.floors[0].furniture = names.map((name, i) => ({
      id: `box-${i}`, name, catalogId: 'imported_object', position: { x: 50 + 65 * i, y: 200 }, rotation: 0,
      scale: { x: 1, y: 1, z: 1 }, width: 60, depth: 60,
    }));
  }));
  await page.keyboard.press('Escape');
  const percent = page.getByRole('button', { name: 'Zoom to 100%', exact: true });
  // Zoom is screen px per cm: the boxes are under 30 px wide below 50%.
  for (let i = 0; i < 20 && Number.parseFloat((await percent.textContent()) ?? '100') >= 50; i++) {
    await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  }
  expect(Number.parseFloat((await percent.textContent()) ?? '100')).toBeLessThan(50);
  const frame = () => page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await frame(); await frame();
  const isCaption = (text: string) => names.includes(text) || text.includes(' × ')
    || (text.endsWith('…') && names.some(name => name.startsWith(text.slice(0, -1))));
  const drawn = (await labels(page)).filter(line => isCaption(line.text));
  expect(drawn.length).toBeGreaterThan(0);
  // Placing measures each line as drawn, so read the same widths here: 6.6 px a letter is wider than these names.
  const widths: Record<string, number> = await page.evaluate(texts => {
    const ctx = document.createElement('canvas').getContext('2d')!;
    ctx.font = '12px sans-serif';
    return Object.fromEntries(texts.map(text => [text, ctx.measureText(text).width]));
  }, drawn.map(line => line.text));
  const boxOf = (line: { text: string; x: number; y: number }) => {
    const half = widths[line.text] / 2;
    return { left: line.x - half, right: line.x + half, top: line.y - 7.5, bottom: line.y + 7.5 };
  };
  for (let i = 0; i < drawn.length; i++) for (let j = i + 1; j < drawn.length; j++) {
    const a = boxOf(drawn[i]), b = boxOf(drawn[j]);
    const across = Math.min(a.right, b.right) - Math.max(a.left, b.left), down = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    expect(across > 1 && down > 1, `"${drawn[i].text}" and "${drawn[j].text}" overlap`).toBe(false);
  }
});
