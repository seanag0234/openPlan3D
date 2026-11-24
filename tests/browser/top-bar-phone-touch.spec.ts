import { expect, test, type Page } from '@playwright/test';

// Under a finger the top bar's every target is a finger wide, and on a phone the bar fits the screen.
test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    localStorage.setItem('hasSeenWelcome', 'true');
    localStorage.setItem('o3d_tips_seen', JSON.stringify(['first-wall', 'first-furniture', 'first-3d', 'first-export', 'first-door']));
  });
});

/** Every shown button and link in the top bar, with its size. */
function targets(page: Page) {
  return page.locator('[data-bar="top"]').evaluate(bar => [...bar.querySelectorAll('button, a')].flatMap(el => {
    const box = el.getBoundingClientRect();
    if (!box.width || !box.height || getComputedStyle(el).visibility === 'hidden') return [];
    return [{ name: el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent?.trim() || el.tagName, width: box.width, height: box.height }];
  }));
}

test.describe('a phone held in the hand', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('the top bar fits and Save is on screen', async ({ page }) => {
    // Not yet: with Feedback in the more menu and the name, Undo and Redo at their 44 px least,
    // the bar is still 502 px wide on a 390 px screen. What else leaves the bar is not decided.
    test.fail();
    await page.goto('/editor');
    const bar = page.locator('[data-bar="top"]');
    await expect(bar).toBeVisible();
    const { scrollWidth, clientWidth } = await bar.evaluate(el => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
    const save = await page.getByRole('button', { name: 'Save', exact: true }).boundingBox();
    expect(save!.x + save!.width).toBeLessThanOrEqual(390);
  });

  test('every target in the top bar is a finger wide and tall', async ({ page }) => {
    await page.goto('/editor');
    await expect(page.locator('[data-bar="top"]')).toBeVisible();
    for (const target of await targets(page)) {
      expect.soft(target.width, `${target.name} width`).toBeGreaterThanOrEqual(44);
      expect.soft(target.height, `${target.name} height`).toBeGreaterThanOrEqual(44);
    }
  });

  test('Feedback is reached from the more menu', async ({ page }) => {
    await page.goto('/editor');
    await page.getByRole('button', { name: 'More actions', exact: true }).click();
    await page.locator('[data-popup="menu"]').getByRole('button', { name: 'Feedback', exact: true }).click();
    await expect(page.locator('[data-popup="menu"]')).toHaveCount(0);
    await expect(page.locator('[data-feedback-open="true"]')).toHaveCount(1);
  });
});

test.describe('an iPad held upright', () => {
  test.use({ viewport: { width: 834, height: 1194 }, hasTouch: true, isMobile: true });

  test('the link back to the plans is a finger wide, and Feedback is on the bar', async ({ page }) => {
    await page.goto('/editor');
    const back = await page.locator('[data-bar="top"] a').first().boundingBox();
    expect(back!.width).toBeGreaterThanOrEqual(44);
    expect(back!.height).toBeGreaterThanOrEqual(44);
    await expect(page.locator('[data-bar="top"]').getByRole('button', { name: 'Feedback', exact: true })).toBeVisible();
  });
});
