import { expect, test } from '@playwright/test';

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    localStorage.setItem('hasSeenWelcome', 'true');
    localStorage.setItem('o3d_tips_seen', JSON.stringify(['first-wall', 'first-furniture', 'first-3d', 'first-export', 'first-door']));
  });
});

for (const [locale, list, layers, opener, bar] of [['en', 'Everything on the plan', 'Layers', 'Everything on the plan (L)', 'Show and hide'], ['pt', 'Tudo na planta', 'Camadas', 'Tudo na planta (L)', 'Mostrar e ocultar']] as const) {
  test(`${locale}: the list of everything on the plan is not called by the bottom bar's Layers name`, async ({ page }) => {
    await page.addInitScript(value => localStorage.setItem('o3d_locale', value), locale);
    await page.goto('/editor');
    await page.getByTitle(opener, { exact: true }).click();
    await expect(page.locator('div').filter({ hasText: new RegExp(`^🗂 ${list}$`) })).toBeVisible();
    await expect(page.locator('div').filter({ hasText: new RegExp(`^🗂 ${layers}$`) })).toHaveCount(0);
    // The bottom bar's popup for hiding kinds of things has a name of its own, and neither is called Layers.
    await expect(page.getByRole('button', { name: `🗂 ${bar}`, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: `🗂 ${layers}`, exact: true })).toHaveCount(0);
  });
}

for (const [locale, list, layers, more, notes] of [['en', 'Everything on the plan', 'Layers', 'More actions', 'Notes'], ['pt', 'Tudo na planta', 'Camadas', 'Mais ações', 'Notas']] as const) {
  test(`${locale}: the more menu calls the list by its own name`, async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 800 });
    await page.addInitScript(value => localStorage.setItem('o3d_locale', value), locale);
    await page.goto('/editor');
    await page.getByRole('button', { name: more, exact: true }).click();
    const menu = page.locator('[data-popup="menu"]');
    await expect(menu.getByRole('button', { name: list, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: layers, exact: true })).toHaveCount(0);
  });

  test(`${locale}: on a narrow screen the more menu opens the notes`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(value => localStorage.setItem('o3d_locale', value), locale);
    await page.goto('/editor');
    await page.getByRole('button', { name: more, exact: true }).click();
    const menu = page.locator('[data-popup="menu"]');
    await menu.getByRole('button', { name: notes, exact: true }).click();
    await expect(menu).toHaveCount(0);
  });
}
