import { expect, test, type Locator, type Page } from '@playwright/test';
import { ipadLandscape, ipadPortrait, openPlan } from './touch';

// The picture buttons around the plan name themselves in a tooltip, which a finger never sees:
// on a touch screen each carries a word under its picture.
const PLAN = 'tests/fixtures/room-with-boxes.openplan.json';
type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** The bottom-left buttons by their names, and the word under each. */
const CORNER: [string, string][] = [
  ['Help', 'Help'],
  ['Show or hide the list of everything on the plan', 'List'],
  ['Toggle Undo History', 'History'],
  ['Notes', 'Notes'],
];
const ZOOM: [string, string][] = [
  ['Zoom out', 'Smaller'],
  ['Zoom in', 'Bigger'],
  ['Zoom to fit', 'Fit'],
  ['Fit selection', 'Fit this'],
];

function button(page: Page, name: string): Locator {
  return page.getByRole('button', { name, exact: true });
}

/** The visible span inside a button that reads `word`, with its font size in px. */
async function wordIn(control: Locator, word: string) {
  return control.evaluate((element, word) => {
    const span = [...element.querySelectorAll('span')].find(s => s.textContent?.trim() === word);
    if (!span) return null;
    const rect = span.getBoundingClientRect();
    return { visible: span.checkVisibility() && rect.width > 0 && rect.height > 0, px: parseFloat(getComputedStyle(span).fontSize) };
  }, word);
}

for (const [name, device] of [['landscape', ipadLandscape], ['portrait', ipadPortrait]] as const) {
  test.describe(`an iPad held ${name}`, () => {
    test.use(device);

    test('each picture button around the plan has a word under it and is finger-sized', async ({ page }) => {
      await openPlan(page, PLAN);
      const pairs = [...CORNER, ...ZOOM];
      if (name === 'landscape') pairs.push(['Hide the list', 'Hide']);
      for (const [label, word] of pairs) {
        const control = button(page, label);
        await expect(control, label).toBeVisible();
        const found = await wordIn(control, word);
        expect(found, `${label} says ${word}`).not.toBeNull();
        expect(found!.visible, `${label}'s word is visible`).toBe(true);
        expect(found!.px, `${label}'s word size`).toBeGreaterThanOrEqual(11);
        const box = (await control.boundingBox())!;
        expect(box.width, `${label} width`).toBeGreaterThanOrEqual(44);
        expect(box.height, `${label} height`).toBeGreaterThanOrEqual(44);
      }
      const corner: [string, Box][] = [];
      for (const [label] of CORNER) corner.push([label, (await button(page, label).boundingBox())!]);
      const others: [string, Box][] = [['zoom box', (await page.locator('[data-bar="zoom"]').boundingBox())!]];
      const add = button(page, 'Add');
      if (await add.isVisible()) others.push(['Add', (await add.boundingBox())!]);
      for (let i = 0; i < corner.length; i++) {
        for (let j = i + 1; j < corner.length; j++) {
          expect(overlaps(corner[i][1], corner[j][1]), `${corner[i][0]} and ${corner[j][0]} overlap`).toBe(false);
        }
        for (const [other, box] of others) expect(overlaps(corner[i][1], box), `${corner[i][0]} and ${other} overlap`).toBe(false);
      }
    });
  });
}

test('with a mouse the picture buttons keep their sizes and carry no word', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openPlan(page, PLAN);
  for (const [label, word] of [...ZOOM, ['Show or hide the list of everything on the plan', 'List'], ['Toggle Undo History', 'History'], ['Notes', 'Notes']]) {
    const control = button(page, label);
    await expect(control, label).toBeVisible();
    const found = await wordIn(control, word);
    expect(found === null || !found.visible, `${label} shows no word`).toBe(true);
  }
  // With a mouse Help keeps its keyboard name.
  const help = button(page, 'Keyboard Shortcuts');
  await expect(help).toBeVisible();
  expect(await wordIn(help, 'Help')).toBeNull();
  expect((await page.locator('[data-bar="zoom"]').getByRole('button', { name: 'Zoom in', exact: true }).boundingBox())!.height).toBe(28);
});
