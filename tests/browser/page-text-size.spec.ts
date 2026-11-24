import { expect, test, type Locator, type Page } from '@playwright/test';
import { fingers, ipadLandscape, ipadPortrait, openPlan, recordLabels, where } from './touch';

// No word the eye can read on the editor's screens is drawn under 12 px, on an iPad either way round or on a laptop.
const FIXTURE = 'tests/fixtures/room-with-boxes.openplan.json';

/** Every word the eye can read on the page that is drawn under 12 px. A word hidden from screen readers but drawn, like the one under a picture button, counts. */
const smallText = (page: Page) => page.evaluate(() => {
  const out: string[] = [];
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walk.nextNode(); node; node = walk.nextNode()) {
    const text = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!/[\p{L}\p{N}]{2}/u.test(text)) continue;
    const el = node.parentElement!, box = el.getBoundingClientRect(), style = getComputedStyle(el);
    if (box.width < 1 || box.height < 1 || box.bottom < 0 || box.top > innerHeight || box.right < 0 || box.left > innerWidth) continue;
    if (style.visibility === 'hidden' || style.display === 'none') continue;
    let opacity = 1;
    for (let up: Element | null = el; up; up = up.parentElement) opacity *= +getComputedStyle(up).opacity;
    if (opacity < 0.05) continue;
    if (parseFloat(style.fontSize) < 12) out.push(`${text.slice(0, 30)} ${style.fontSize}`);
  }
  return out;
});

const devices = [
  ['an iPad lying down', ipadLandscape],
  ['an iPad upright', ipadPortrait],
  ['a laptop', { viewport: { width: 1440, height: 900 }, hasTouch: false, isMobile: false }],
] as const;

for (const [name, device] of devices) {
  test.describe(name, () => {
    test.use(device);

    test('no word on the editor\'s screens is under 12 px', async ({ page }) => {
      test.setTimeout(90_000);
      const touch = device.hasTouch;
      const hand = touch ? await fingers(page) : null;
      const press = (target: Locator) => touch ? target.tap() : target.click();
      const expectReadable = async (moment: string) => expect.soft(await smallText(page), moment).toEqual([]);

      await recordLabels(page);
      await openPlan(page, FIXTURE);
      await page.keyboard.press('Escape');
      await expectReadable('as the plan opens');

      // Each tab of the list of things to add; upright it opens from Add.
      const add = page.getByRole('button', { name: 'Add', exact: true });
      if (await add.isVisible()) await press(add);
      for (const tab of ['Build', 'Rooms', 'Things']) {
        await press(page.getByRole('button', { name: tab, exact: true }));
        await expectReadable(`the ${tab} tab of the list of things to add`);
      }
      const hide = page.getByRole('button', { name: 'Hide the list', exact: true });
      if (await hide.isVisible()) await press(hide);

      // A box selected, and its details open.
      const box = await where(page, 'Box A');
      if (hand) {
        await hand.tap(box.x, box.y - 24);
        await press(page.getByRole('button', { name: 'Details', exact: true }));
      } else await page.mouse.click(box.x, box.y);
      await expect(page.locator('[data-plan-properties]')).toBeVisible();
      await expectReadable('a box selected, with its details open');
      const done = page.locator('[data-plan-properties]').getByRole('button', { name: 'Done', exact: true });
      if (await done.isVisible()) await press(done);
      await page.keyboard.press('Escape');

      // The Export menu.
      const exportButton = page.getByRole('button', { name: 'Export', exact: true });
      await press(exportButton);
      await expect(page.getByRole('button', { name: 'Download JSON', exact: true })).toBeVisible();
      await expectReadable('the Export menu open');
      await press(exportButton);

      // The More actions menu, where there is one.
      const more = page.getByRole('button', { name: 'More actions', exact: true });
      if (await more.isVisible()) {
        await press(more);
        await expect(page.locator('[data-popup="menu"]')).toBeVisible();
        await expectReadable('the More actions menu open');
        await press(more);
      }

      // The list of everything on the plan.
      const list = page.getByRole('button', { name: 'Show or hide the list of everything on the plan', exact: true });
      await press(list);
      await expect(page.getByText('🗂 Everything on the plan', { exact: true })).toBeVisible();
      await expectReadable('the list of everything on the plan open');
      await press(list);

      // The history panel.
      await press(page.getByRole('button', { name: 'Toggle Undo History', exact: true }));
      await expect(page.getByText('Undo History', { exact: true }).first()).toBeVisible();
      await expectReadable('the history panel open');
    });
  });
}
