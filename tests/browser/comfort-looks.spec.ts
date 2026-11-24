import { expect, test, type Page } from '@playwright/test';

function observe(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  return () => expect(errors).toEqual([]);
}

const LOOKS = [['Soft paper', 'soft'], ['Rose tint', 'rose'], ['Dim', 'dim'], ['Night', 'night']] as const;

async function openAppearance(page: Page) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
  await settings.getByRole('button', { name: 'Appearance', exact: true }).click();
  return settings;
}

const rootFilter = (page: Page) => page.evaluate(() => getComputedStyle(document.documentElement).filter);

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    localStorage.setItem('hasSeenWelcome', 'true');
    localStorage.setItem('o3d_tips_seen', JSON.stringify(['first-wall', 'first-furniture', 'first-3d', 'first-export', 'first-door']));
  });
});

test('each easier-on-the-eyes look softens the whole page, Light takes it away, and Night stays after a reload', async ({ page }) => {
  const check = observe(page);
  await page.goto('/editor');
  const html = page.locator('html');
  const settings = await openAppearance(page);

  for (const [name, look] of LOOKS) {
    const button = settings.getByRole('button', { name, exact: true });
    await button.click();
    await expect(html).toHaveAttribute('data-comfort', look);
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(settings.getByRole('button', { name: 'Light' })).toHaveAttribute('aria-pressed', 'false');
    expect(await rootFilter(page)).not.toBe('none');
    // An open dialog draws above the page, outside the page's filter, so it carries the look itself.
    expect(await settings.evaluate(dialog => getComputedStyle(dialog).filter)).toBe(await rootFilter(page));
  }

  const light = settings.getByRole('button', { name: 'Light' });
  await light.click();
  await expect(html).not.toHaveAttribute('data-comfort');
  await expect(light).toHaveAttribute('aria-pressed', 'true');
  await expect(settings.getByRole('button', { name: 'Night', exact: true })).toHaveAttribute('aria-pressed', 'false');
  expect(await rootFilter(page)).toBe('none');
  expect(await settings.evaluate(dialog => getComputedStyle(dialog).filter)).toBe('none');

  await settings.getByRole('button', { name: 'Night', exact: true }).click();
  await page.reload();
  await expect(html).toHaveAttribute('data-comfort', 'night');
  expect(await rootFilter(page)).not.toBe('none');
  check();
});

test('Less motion stops fades and slides, and unticking brings them back', async ({ page }) => {
  const check = observe(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/editor');
  const html = page.locator('html');
  const settings = await openAppearance(page);
  const lightButton = settings.getByRole('button', { name: 'Light' });
  const duration = () => lightButton.evaluate(element => parseFloat(getComputedStyle(element).transitionDuration));
  expect(await duration()).toBeGreaterThanOrEqual(0.01);

  const toggle = settings.getByRole('checkbox', { name: /Less motion/ });
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await expect(html).toHaveAttribute('data-less-motion', '');
  expect(await duration()).toBeLessThan(0.01);

  await toggle.uncheck();
  await expect(html).not.toHaveAttribute('data-less-motion');
  expect(await duration()).toBeGreaterThanOrEqual(0.01);
  check();
});

test('with Soft paper on, the bar at the top of the editor still starts at the top of the window', async ({ page }) => {
  const check = observe(page);
  await page.goto('/editor');
  const settingsButton = page.getByRole('button', { name: 'Settings', exact: true });
  const barTop = () => settingsButton.evaluate(element => element.parentElement!.getBoundingClientRect().top);

  let settings = await openAppearance(page);
  await settings.getByRole('button', { name: 'Light' }).click();
  await page.keyboard.press('Escape');
  await expect(settings).toBeHidden();
  const lightTop = await barTop();

  settings = await openAppearance(page);
  await settings.getByRole('button', { name: 'Soft paper', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(settings).toBeHidden();
  await expect(page.locator('html')).toHaveAttribute('data-comfort', 'soft');
  expect(await barTop()).toBe(lightTop);
  check();
});
