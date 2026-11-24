import { expect, test, type Page } from '@playwright/test';
import { ipadLandscape, openPlan } from './touch';

const PLAN = 'tests/fixtures/room-with-boxes.openplan.json';
const KEYS_AND_MOUSE = /\bEsc\b|\bM to\b|\bclick|dbl-|scroll|\bR to\b/i;

const hint = (page: Page) => page.locator('[data-tool-hint]');
// The sidebar's tool buttons, named by title and description ("Select Click to select elements"), not the top bar's "Select mode".
const tool = (page: Page, name: RegExp) => page.getByRole('button', { name }).first();

async function pickMeasure(page: Page) {
  await tool(page, /^Measure /).click();
  await expect(hint(page)).toHaveCount(1);
}

async function expectDoneReturnsToSelect(page: Page) {
  await hint(page).getByRole('button', { name: 'Done', exact: true }).click();
  await expect(hint(page)).toHaveCount(0);
  await expect(tool(page, /^Select (?!mode)/)).toHaveClass(/ring-blue-200/);
  await expect(tool(page, /^Measure /)).not.toHaveClass(/ring-blue-200/);
}

test.describe('on a touch screen', () => {
  test.use(ipadLandscape);

  test('the measure message speaks of taps, and Done returns to the select tool', async ({ page }) => {
    await openPlan(page, PLAN);
    await pickMeasure(page);
    await expect(hint(page)).toContainText('Tap two points to measure.');
    expect(await hint(page).innerText()).not.toMatch(KEYS_AND_MOUSE);
    await expectDoneReturnsToSelect(page);
  });
});

test('with a mouse the measure message keeps its words, and Done returns to the select tool', async ({ page }) => {
  await openPlan(page, PLAN);
  await pickMeasure(page);
  await expect(hint(page)).toContainText('Click or tap two points to measure · M to exit · Esc to cancel');
  await expectDoneReturnsToSelect(page);
});
