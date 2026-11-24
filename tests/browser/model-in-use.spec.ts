import { expect, test } from '@playwright/test';

test.setTimeout(120_000);

test('Remove model says first that a model on the plan has to come off it', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('o3d_tips_seen', JSON.stringify(['first-wall', 'first-furniture', 'first-3d', 'first-export', 'first-door'])));
  await page.goto('/editor');
  await page.getByRole('button', { name: 'Things', exact: true }).click();
  const panel = page.getByRole('region', { name: 'My 3D models', exact: true });
  await panel.locator('input[type=file]').setInputFiles('tests/fixtures/local-model-textured-box.glb');
  const dialog = page.getByRole('dialog', { name: 'Add a 3D model (GLB file)', exact: true });
  await expect(dialog.locator('canvas')).toBeVisible();
  await dialog.getByRole('textbox', { name: 'Model name', exact: true }).fill('Made-up box');
  await dialog.getByRole('button', { name: 'Add to project', exact: true }).click();
  await expect(dialog).toBeHidden();

  await panel.getByRole('button', { name: 'Place at view center', exact: true }).click();
  await panel.getByRole('button', { name: 'Remove model', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: 'Remove model', exact: true });
  await expect(panel.getByText('This is on the plan once. Take it off the plan first, then remove the model.', { exact: true })).toBeVisible();
  await expect(confirmation).toHaveCount(0);

  await page.getByRole('button', { name: 'Delete', exact: true }).and(page.getByTitle('Delete', { exact: true })).click();
  await expect(panel.getByText(/This is on the plan/)).toHaveCount(0);
  await panel.getByRole('button', { name: 'Remove model', exact: true }).click();
  await expect(confirmation).toBeVisible();
});
