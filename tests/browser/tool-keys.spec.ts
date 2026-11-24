import { expect, test, type Page } from '@playwright/test';
import { ipadLandscape, openPlan } from './touch';

const PLAN = 'tests/fixtures/room-with-boxes.openplan.json';

const TOOLS = [
  ['Select', 'V'],
  ['Draw Wall', 'W'],
  ['Text Label', 'T'],
  ['Dimension', 'N'],
  ['Measure', 'M'],
] as const;

/** The tool's button in the list of tools, found by the name it starts with. */
function toolButton(page: Page, name: string) {
  return page.locator('button').filter({ has: page.locator('div.font-medium', { hasText: new RegExp(`^${name}\\b`) }) }).first();
}

test('with a mouse, each tool shows its key after its name', async ({ page }) => {
  await openPlan(page, PLAN);
  // The heading over the text and dimension tools says what they add.
  await expect(page.getByRole('heading', { name: 'Words and sizes', exact: true })).toBeVisible();
  for (const [name, key] of TOOLS) {
    const kbd = toolButton(page, name).locator('kbd');
    await expect(kbd).toHaveCount(1);
    await expect(kbd).toBeVisible();
    await expect(kbd).toHaveText(key);
  }
});

test.describe('iPad landscape', () => {
  test.use(ipadLandscape);

  test('on a touch screen no tool names a key', async ({ page }) => {
    await openPlan(page, PLAN);
    for (const [name] of TOOLS) {
      const button = toolButton(page, name);
      await expect(button).toBeVisible();
      await expect(button.locator('kbd')).toBeHidden();
      const shown = await button.innerText();
      for (const word of ['(T)', '(N)', '(M)', 'Click', 'dbl-click']) expect(shown, `${name}: ${shown}`).not.toContain(word);
    }
  });
});
