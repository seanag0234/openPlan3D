import { expect, test, type Page } from '@playwright/test';
import { ipadLandscape, ipadPortrait, openPlan } from './touch';

const PLAN = 'tests/fixtures/room-with-boxes.openplan.json';
const BARS = '[data-bar="top"], [data-bar="bottom"], [data-bar="zoom"]';

type Box = { what: string; width: number; height: number; left: number; right: number };

/** Every visible button, select and text box in the bars around the plan, with its size. */
async function controls(page: Page): Promise<Box[]> {
  return page.locator(BARS).evaluateAll(bars => bars.flatMap(bar =>
    [...bar.querySelectorAll<HTMLElement>('button, select, input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"])')]
      .filter(element => element.checkVisibility() && element.getClientRects().length > 0)
      .map(element => {
        const rect = element.getBoundingClientRect();
        const what = `${bar.getAttribute('data-bar')} ${element.tagName.toLowerCase()} "${element.getAttribute('aria-label') ?? element.textContent?.trim() ?? ''}"`;
        return { what, width: rect.width, height: rect.height, left: rect.left, right: rect.right };
      })));
}

for (const [name, device] of [['iPad landscape', ipadLandscape], ['iPad portrait', ipadPortrait]] as const) {
  test.describe(name, () => {
    test.use(device);

    test('every control in the bars is big enough for a finger and stays on screen', async ({ page }) => {
      await openPlan(page, PLAN);
      const width = page.viewportSize()!.width;
      const found = await controls(page);
      expect(found.length).toBeGreaterThan(8);
      for (const control of found) {
        const isButton = control.what.split(' ')[1] === 'button';
        expect.soft(control.height, `${control.what} height`).toBeGreaterThanOrEqual(44);
        if (isButton) expect.soft(control.width, `${control.what} width`).toBeGreaterThanOrEqual(44);
      }
      for (const control of found.filter(item => !item.what.startsWith('zoom'))) {
        if (control.what.startsWith('bottom')) continue;
        expect.soft(control.left, `${control.what} left edge`).toBeGreaterThanOrEqual(0);
        expect.soft(control.right, `${control.what} right edge`).toBeLessThanOrEqual(width);
      }
      // The bottom bar scrolls inside itself; its own edges and its first item stay in the window.
      const bottom = await page.locator('[data-bar="bottom"]').evaluate(bar => {
        const rect = bar.getBoundingClientRect();
        const first = (bar.firstElementChild as HTMLElement).getBoundingClientRect();
        return { left: rect.left, right: rect.right, firstLeft: first.left, wraps: [...bar.querySelectorAll('button')].some(button => {
          // Words that wrap inside a button sit on more than one line.
          const range = document.createRange();
          range.selectNodeContents(button);
          return new Set([...range.getClientRects()].filter(r => r.width > 0).map(r => Math.round(r.top))).size > 1;
        }) };
      });
      expect(bottom.left).toBeGreaterThanOrEqual(0);
      expect(bottom.right).toBeLessThanOrEqual(width);
      expect(bottom.firstLeft).toBeGreaterThanOrEqual(bottom.left);
      expect(bottom.wraps).toBe(false);
      const top = await page.locator('[data-bar="top"]').evaluate(bar => ({ scroll: bar.scrollWidth, client: bar.clientWidth }));
      expect(top.scroll).toBeLessThanOrEqual(top.client);
    });

    test('the bottom bar keeps only what a finger needs, and the popup holds the rest', async ({ page }) => {
      await openPlan(page, PLAN);
      const bar = page.locator('[data-bar="bottom"]');
      await expect(bar.getByText(/walls?$/)).toHaveCount(0);
      await expect(bar.getByText(/rooms?$/)).toHaveCount(0);
      for (const name of [/Grid/, /Rulers/, /Map/]) await expect(bar.getByRole('button', { name })).toHaveCount(0);
      await bar.getByTitle('Layer Visibility', { exact: true }).click();
      for (const name of ['Grid', 'Rulers', 'Map']) await expect(page.getByRole('checkbox', { name, exact: true })).toBeVisible();
      const grid = page.getByRole('checkbox', { name: 'Grid', exact: true });
      const before = await grid.isChecked();
      await grid.click();
      await expect(grid).toBeChecked({ checked: !before });
      // The zoom buttons sit above the row, not on it.
      const zoom = (await page.locator('[data-bar="zoom"]').boundingBox())!;
      const row = (await bar.boundingBox())!;
      expect(zoom.y + zoom.height).toBeLessThanOrEqual(row.y);
    });

    test('the top bar\'s picture buttons say what they are in words', async ({ page }) => {
      await openPlan(page, PLAN);
      const top = page.locator('[data-bar="top"]');
      const pictures = [
        top.getByRole('link', { name: 'Projects', exact: true }),
        ...['Undo', 'Redo', 'More actions', 'Export'].map(name => top.getByRole('button', { name, exact: true })),
      ];
      for (const control of pictures) {
        await expect(control).toBeVisible();
        const words = await control.evaluate(element => [...element.querySelectorAll('span')]
          .filter(span => span.checkVisibility() && span.getBoundingClientRect().height > 0)
          .map(span => span.textContent?.trim()).filter(Boolean).join(' '));
        expect(words, await control.getAttribute('aria-label') ?? 'Projects').not.toBe('');
      }
    });

    test('the feedback button opens the feedback sheet', async ({ page }) => {
      await openPlan(page, PLAN);
      const feedback = page.locator('[data-bar="top"]').getByRole('button', { name: 'Feedback', exact: true });
      await expect(feedback).toBeVisible();
      await expect(feedback).toContainText('Feedback');
      await expect(feedback).toHaveAttribute('data-feedback-open', 'false');
      await feedback.click();
      await expect(feedback).toHaveAttribute('data-feedback-open', 'true');
      const top = await page.locator('[data-bar="top"]').evaluate(bar => ({ scroll: bar.scrollWidth, client: bar.clientWidth }));
      expect(top.scroll).toBeLessThanOrEqual(top.client);
    });
  });
}

test('with a mouse the bars keep their sizes', async ({ page }) => {
  await openPlan(page, PLAN);
  const zoomIn = page.locator('[data-bar="zoom"]').getByRole('button', { name: 'Zoom in', exact: true });
  expect((await zoomIn.boundingBox())!.height).toBe(28);
  const fit = page.locator('[data-bar="bottom"]').getByRole('button', { name: /Fit/ });
  expect((await fit.boundingBox())!.height).toBeLessThan(30);
  await expect(page.locator('[data-bar="bottom"]').getByRole('button', { name: /Grid/ })).toBeVisible();
  await expect(page.locator('[data-bar="bottom"]').getByText(/walls$/)).toBeVisible();
});

test('with a mouse the feedback button is a picture below 1536 px and says Feedback from 1536 px', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 800 });
  await openPlan(page, PLAN);
  const feedback = page.locator('[data-bar="top"]').getByRole('button', { name: 'Feedback', exact: true });
  await expect(feedback).toBeVisible();
  await expect(feedback.getByText('Feedback', { exact: true })).toBeHidden();
  await page.setViewportSize({ width: 1536, height: 900 });
  await expect(feedback.getByText('Feedback', { exact: true })).toBeVisible();
  await feedback.click();
  await expect(feedback).toHaveAttribute('data-feedback-open', 'true');
});

for (const [locale, width] of [['en', 1280], ['pt', 1280], ['pt', 1440]] as const) {
  test(`with a mouse at ${width} px in ${locale} the top bar holds every control and Save stays on screen`, async ({ page }) => {
    await page.addInitScript(l => localStorage.setItem('o3d_locale', l), locale);
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/editor');
    const top = page.locator('[data-bar="top"]');
    await expect(top.getByRole('button', { name: locale === 'en' ? 'Save' : 'Salvar', exact: true })).toBeVisible();
    const room = await top.evaluate(bar => ({ scroll: bar.scrollWidth, client: bar.clientWidth }));
    expect(room.scroll).toBeLessThanOrEqual(room.client);
  });
}
