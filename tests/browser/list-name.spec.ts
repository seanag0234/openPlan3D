import { expect, test } from '@playwright/test';

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    localStorage.setItem('hasSeenWelcome', 'true');
    localStorage.setItem('o3d_tips_seen', JSON.stringify(['first-wall', 'first-furniture', 'first-3d', 'first-export', 'first-door']));
  });
});

for (const [locale, list, layers, opener] of [['en', 'Everything on the plan', 'Layers', 'Layers Panel (L)'], ['pt', 'Tudo na planta', 'Camadas', 'Painel de camadas (L)']] as const) {
  test(`${locale}: the list of everything on the plan is not called by the bottom bar's Layers name`, async ({ page }) => {
    await page.addInitScript(value => localStorage.setItem('o3d_locale', value), locale);
    await page.goto('/editor');
    await page.getByTitle(opener, { exact: true }).click();
    await expect(page.locator('div').filter({ hasText: new RegExp(`^🗂 ${list}$`) })).toBeVisible();
    await expect(page.locator('div').filter({ hasText: new RegExp(`^🗂 ${layers}$`) })).toHaveCount(0);
    // The bottom bar keeps its name for hiding kinds of things.
    await expect(page.getByRole('button', { name: `🗂 ${layers}`, exact: true })).toBeVisible();
  });
}
