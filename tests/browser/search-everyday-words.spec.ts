import { expect, test } from '@playwright/test';

const SYMBOLS = ['Person', 'Two People', 'Sedan', 'SUV', 'Pickup', 'Deciduous Tree', 'Conifer', 'Shrub', 'Hedge', 'Potted Plant', 'Grass', 'Patio Umbrella'];

test('the Objects search finds things by everyday words, symbols included', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('hasSeenWelcome', 'true'));
  await page.goto('/editor');
  await page.getByRole('button', { name: 'Objects', exact: true }).click();
  const search = page.getByRole('textbox', { name: 'Search furniture...', exact: true });
  const symbol = (name: string) => page.getByRole('button', { name, exact: true });
  await expect(symbol('Person')).toBeVisible();

  await search.fill('couch');
  await expect(page.getByRole('button', { name: /^Sofa(?: Sofa)? 200×90cm$/ })).toBeVisible();
  await expect(symbol('Person')).toHaveCount(0);

  await search.fill('truck');
  await expect(symbol('Pickup')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Stove(?: Stove)? / })).toHaveCount(0);
  await expect(symbol('Person')).toHaveCount(0);

  await search.fill('zzzz');
  await expect(page.getByText('0 results for "zzzz"', { exact: true })).toBeVisible();
  await expect(page.getByText('Nothing in the list is called “zzzz”.', { exact: true })).toBeVisible();
  await expect(symbol('Person')).toHaveCount(0);

  await search.fill('');
  for (const name of SYMBOLS) await expect(symbol(name)).toBeVisible();
  // Person is the first symbol, as before searching.
  const first = await page.evaluate(names => [...document.querySelectorAll('button')]
    .map(button => button.textContent?.trim() ?? '').find(text => names.includes(text)), SYMBOLS);
  expect(first).toBe('Person');
});
