import { expect, test, type Page } from '@playwright/test';

async function openObjects(page: Page) {
  await page.addInitScript(() => localStorage.setItem('hasSeenWelcome', 'true'));
  await page.goto('/editor');
  await page.getByRole('button', { name: 'Objects', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Search furniture...', exact: true })).toBeVisible();
}

const sofaCard = (page: Page) => page.getByRole('button', { name: /^Sofa(?: Sofa)? / }).first();

test('with feet and inches set, the Objects list gives sizes in feet and inches', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('o3d_settings', JSON.stringify({ units: 'imperial' })));
  await openObjects(page);
  await expect(sofaCard(page)).toContainText(`6'7" × 2'11"`);
  const cards = page.locator('button[draggable="true"]');
  expect(await cards.count()).toBeGreaterThan(10);
  const texts = await cards.allInnerTexts();
  expect(texts.filter(text => /cm\b/.test(text))).toEqual([]);
});

test('with metric units, the Objects list keeps its centimetres', async ({ page }) => {
  await openObjects(page);
  await expect(sofaCard(page)).toContainText('200×90cm');
});
