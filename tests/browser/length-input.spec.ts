import { expect, test, type Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { labels, openPlan, recordLabels, savedPlan, where } from './touch';

const FIXTURE = 'tests/fixtures/room-with-boxes.openplan.json';
const boxA = (plan: any) => plan.floors[0].furniture.find((item: any) => item.id === 'box-a');

/** The room with boxes, saved by someone who works in the given units. */
async function openIn(page: Page, units: 'metric' | 'imperial', file: string) {
  const plan = JSON.parse(await readFile(FIXTURE, 'utf8'));
  plan.displaySettings = { ...plan.displaySettings, units };
  await writeFile(file, JSON.stringify(plan));
  await recordLabels(page);
  await openPlan(page, file);
  await page.keyboard.press('Escape');
  const a = await where(page, 'Box A');
  await page.mouse.click(a.x, a.y - 24);
  await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('Box A');
}

test('in feet and inches, a width is typed in two boxes that keep what was typed', async ({ page }, testInfo) => {
  await openIn(page, 'imperial', testInfo.outputPath('feet.openplan.json'));
  const feet = page.getByRole('spinbutton', { name: 'Width (ft)', exact: true });
  const inches = page.getByRole('spinbutton', { name: 'Width (in)', exact: true });
  // Box A is 120 cm: 3 ft 11.2 in.
  await expect(feet).toHaveValue('3');
  await expect(inches).toHaveValue('11.2');
  await feet.click({ clickCount: 3 });
  await feet.pressSequentially('5', { delay: 50 });
  await expect(feet).toHaveValue('5');
  await expect(inches).toHaveValue('11.2');
  await inches.click({ clickCount: 3 });
  for (const key of ['6', '.', '5']) {
    await inches.press(key);
    await expect(feet).toHaveValue('5');
  }
  await expect(inches).toHaveValue('6.5');
  await inches.press('Backspace');
  await inches.press('Backspace');
  await expect(inches).toHaveValue('6');
  await expect(feet).toHaveValue('5');
  await inches.press('Enter');
  await expect(inches).not.toBeFocused();
  await expect(feet).toHaveValue('5');
  await expect(inches).toHaveValue('6');
  expect(boxA(await savedPlan(page)).width).toBeCloseTo(167.64, 6);
});

test('in centimetres, a typed width is saved while the cursor stays in the box', async ({ page }, testInfo) => {
  await openIn(page, 'metric', testInfo.outputPath('metric.openplan.json'));
  const width = page.getByRole('spinbutton', { name: 'Width (cm)', exact: true });
  await expect(width).toHaveValue('120');
  await width.fill('150');
  await expect(width).toBeFocused();
  await expect.poll(async () => (await labels(page)).some(label => label.text.startsWith('1.5 m'))).toBe(true);
  await expect(width).toHaveValue('150');
  await width.press('Tab');
  expect(boxA(await savedPlan(page)).width).toBe(150);
});
