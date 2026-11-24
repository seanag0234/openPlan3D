import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

/** An iPad held sideways: touch only, no hover. */
export const ipadLandscape = { viewport: { width: 1194, height: 834 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 };
/** An iPad held upright. */
export const ipadPortrait = { viewport: { width: 834, height: 1194 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 };

const PLAN_CANVAS = 'Floor plan editor canvas';

/** Open the editor and import a plan file, as Export, Import JSON does; waits for the plan's name. */
export async function openPlan(page: Page, file: string): Promise<void> {
  const text = await readFile(file, 'utf8');
  const plan = JSON.parse(text);
  await page.addInitScript(() => {
    localStorage.setItem('o3d_tips_seen', JSON.stringify(['first-wall', 'first-furniture', 'first-3d', 'first-export', 'first-door']));
  });
  await page.goto('/editor');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import JSON', exact: true }).click();
  await (await chooser).setFiles({ name: file.split('/').pop()!, mimeType: 'application/json', buffer: Buffer.from(text) });
  await expect(page.getByRole('button', { name: plan.name, exact: true })).toBeVisible();
}

/** The plan as Export, Download JSON saves it. */
export async function savedPlan(page: Page): Promise<any> {
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download JSON', exact: true }).click();
  return JSON.parse(await readFile((await (await download).path())!, 'utf8'));
}

export interface Fingers {
  tap(x: number, y: number): Promise<void>;
  doubleTap(x: number, y: number): Promise<void>;
  /** 700 ms unless given. */
  longPress(x: number, y: number, ms?: number): Promise<void>;
  /** `second`: another finger lands mid-drag and lifts. */
  drag(from: [number, number], to: [number, number], options?: { steps?: number; second?: [number, number] }): Promise<void>;
  pinch(center: [number, number], fromGap: number, toGap: number): Promise<void>;
}

/**
 * Fingers on the screen, sent through the Chrome DevTools Protocol as a real screen sends them:
 * every touch event lists every finger still down. Chromium only.
 */
export async function fingers(page: Page): Promise<Fingers> {
  test.skip(page.context().browser()?.browserType().name() !== 'chromium', 'Touch through CDP is Chromium only');
  const cdp = await page.context().newCDPSession(page);
  const down = new Map<number, [number, number]>();
  let nextId = 0;
  const points = () => [...down].map(([id, [x, y]]) => ({ x, y, id }));
  const send = (type: 'touchStart' | 'touchMove') => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points() });
  const pause = (ms: number) => page.waitForTimeout(ms);

  async function land(at: [number, number]) { const id = nextId++; down.set(id, at); await send('touchStart'); return id; }
  async function move(id: number, at: [number, number]) { down.set(id, at); await send('touchMove'); }
  async function lift(id: number) {
    const [x, y] = down.get(id)!;
    down.delete(id);
    // touchEnd releases the fingers it lists, or every finger when it lists none; the others stay down.
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: down.size ? [{ x, y, id }] : [] });
  }

  async function tap(x: number, y: number) { const id = await land([x, y]); await pause(30); await lift(id); }
  const hand: Fingers = {
    tap,
    async doubleTap(x, y) { await tap(x, y); await pause(120); await tap(x, y); },
    async longPress(x, y, ms = 700) { const id = await land([x, y]); await pause(ms); await lift(id); },
    async drag(from, to, options = {}) {
      const steps = Math.max(1, options.steps ?? 10);
      const id = await land(from);
      let second: number | null = null;
      for (let i = 1; i <= steps; i++) {
        const at: [number, number] = [from[0] + (to[0] - from[0]) * i / steps, from[1] + (to[1] - from[1]) * i / steps];
        await move(id, at);
        if (options.second && i === Math.ceil(steps / 2)) {
          second = await land(options.second);
          await pause(30);
          await lift(second);
        }
        await pause(16);
      }
      await lift(id);
    },
    async pinch([cx, cy], fromGap, toGap) {
      const steps = 10;
      const a = await land([cx - fromGap / 2, cy]);
      const b = await land([cx + fromGap / 2, cy]);
      for (let i = 1; i <= steps; i++) {
        const gap = fromGap + (toGap - fromGap) * i / steps;
        down.set(a, [cx - gap / 2, cy]); down.set(b, [cx + gap / 2, cy]);
        await send('touchMove');
        await pause(16);
      }
      await lift(b);
      await lift(a);
    },
  };
  return hand;
}

/** Record every fillText on the plan canvas, as { text, x, y, px } in screen px, frame by frame. Call before openPlan. */
export async function recordLabels(page: Page): Promise<void> {
  await page.addInitScript((label) => {
    const w = window as any;
    w.__labels = [];
    const isPlan = (c: CanvasRenderingContext2D) => c.canvas instanceof HTMLCanvasElement && c.canvas.getAttribute('aria-label') === label;
    const clear = CanvasRenderingContext2D.prototype.clearRect;
    CanvasRenderingContext2D.prototype.clearRect = function (x, y, width, height) {
      // A full clear starts a new frame of the plan.
      if (isPlan(this) && x <= 0 && y <= 0 && width >= this.canvas.width && height >= this.canvas.height) w.__labels = [];
      return clear.call(this, x, y, width, height);
    };
    const fill = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
      if (isPlan(this)) {
        const m = this.getTransform(), p = new DOMPoint(x, y).matrixTransform(m), b = this.canvas.getBoundingClientRect();
        const toScreen = b.width / this.canvas.width, size = Number(/([\d.]+)px/.exec(this.font)?.[1] ?? 0);
        w.__labels.push({ text: String(text), x: b.x + p.x * toScreen, y: b.y + p.y * toScreen, px: size * Math.hypot(m.a, m.b) * toScreen });
      }
      return maxWidth === undefined ? fill.call(this, text, x, y) : fill.call(this, text, x, y, maxWidth);
    };
  }, PLAN_CANVAS);
}

/** The labels drawn in the latest frame of the plan. */
export async function labels(page: Page): Promise<{ text: string; x: number; y: number; px: number }[]> {
  return page.evaluate(() => [...((window as any).__labels ?? [])]);
}

/** Screen position of a drawn label, e.g. 'Box A', once it has stopped moving. */
export async function where(page: Page, text: string): Promise<{ x: number; y: number }> {
  const read = async () => (await labels(page)).find(item => item.text === text) ?? null;
  const frame = () => page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  let last: { x: number; y: number } | null = null;
  await expect.poll(async () => {
    await frame();
    const now = await read();
    const settled = !!now && !!last && Math.abs(now.x - last.x) < 0.5 && Math.abs(now.y - last.y) < 0.5;
    last = now && { x: now.x, y: now.y };
    return settled;
  }, { message: `"${text}" is drawn on the plan and still` }).toBe(true);
  return last!;
}
