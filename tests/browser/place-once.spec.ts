import { expect, test, type Page } from '@playwright/test';
import { fingers, ipadLandscape, openPlan, recordLabels, savedPlan, where } from './touch';

// Picking an item and pressing the plan puts down one piece, selects it and goes back to Select:
// further presses on the same spot select that piece instead of adding more.
const FIXTURE = 'tests/fixtures/room-with-boxes.openplan.json';

async function open(page: Page) {
  await recordLabels(page);
  await openPlan(page, FIXTURE);
  const before = await savedPlan(page);
  await page.keyboard.press('Escape');
  const a = await where(page, 'Box A');
  const b = await where(page, 'Box B');
  const label = await where(page, 'Reading corner');
  const scale = (b.x - a.x) / 250;
  // Bare floor at (300, 120) cm: clear of the boxes, the label and the walls.
  const spot: [number, number] = [a.x + 150 * scale, label.y + 60 * scale];
  return { before, spot };
}

async function pickSofa(page: Page, press: (button: ReturnType<Page['getByRole']>) => Promise<void>) {
  await press(page.getByRole('button', { name: 'Objects', exact: true }));
  await press(page.getByRole('button', { name: /^Sofa(?: Sofa)?(?: 200×90cm)?$/ }).first());
}

async function expectOnePlaced(page: Page, before: any) {
  // The bar at the selection shows only with the Select tool and something selected. Its copy button is
  // named Duplicate with a mouse and Copy under a finger.
  await expect(page.locator('[data-selection-bar]').getByRole('button', { name: /^(Duplicate|Copy)$/ })).toHaveCount(1);
  const after = await savedPlan(page);
  const added = after.floors[0].furniture.filter((f: any) => !before.floors[0].furniture.some((g: any) => g.id === f.id));
  expect(added.map((f: any) => f.catalogId)).toEqual(['sofa']);
}

test('three clicks after picking a sofa place one sofa, selected, with the Select tool', async ({ page }) => {
  const { before, spot } = await open(page);
  await pickSofa(page, button => button.click());
  for (let i = 0; i < 3; i++) {
    await page.mouse.click(...spot);
    await page.waitForTimeout(600);   // three single clicks, not a double click
  }
  await expectOnePlaced(page, before);
});

test.describe('with fingers', () => {
  test.use(ipadLandscape);

  test('three taps after picking a sofa place one sofa, selected, with the Select tool', async ({ page }) => {
    const hand = await fingers(page);
    const { before, spot } = await open(page);
    await pickSofa(page, button => button.tap());
    for (let i = 0; i < 3; i++) {
      await hand.tap(...spot);
      await page.waitForTimeout(450);   // three single taps, not a double tap
    }
    await expectOnePlaced(page, before);
  });
});
