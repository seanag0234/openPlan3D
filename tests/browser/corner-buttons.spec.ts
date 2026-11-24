import { expect, test, type Locator } from '@playwright/test';
import { openPlan } from './touch';

test.use({ viewport: { width: 1440, height: 900 } });

type Box = { x: number; y: number; width: number; height: number };

async function boxes(buttons: Record<string, Locator>): Promise<[string, Box][]> {
  const found: [string, Box][] = [];
  for (const [name, button] of Object.entries(buttons)) {
    await expect(button, name).toBeVisible();
    const box = await button.boundingBox();
    expect(box, name).not.toBeNull();
    found.push([name, box!]);
  }
  return found;
}

function expectApart(found: [string, Box][]) {
  for (let i = 0; i < found.length; i++) {
    for (let j = i + 1; j < found.length; j++) {
      const [a, p] = found[i], [b, q] = found[j];
      const overlap = p.x < q.x + q.width && q.x < p.x + p.width && p.y < q.y + q.height && q.y < p.y + p.height;
      expect(overlap, `${a} and ${b} overlap: ${JSON.stringify(p)} ${JSON.stringify(q)}`).toBe(false);
    }
  }
}

test('the corner buttons keep clear of one another in 2D, and of the Lighting button in 3D', async ({ page }) => {
  test.setTimeout(120_000);
  await openPlan(page, 'tests/fixtures/room-with-boxes.openplan.json');
  const button = (name: string) => page.getByRole('button', { name, exact: true });
  const help = button('Keyboard Shortcuts'), history = button('Toggle Undo History'), notes = button('Notes');

  expectApart(await boxes({ help, list: button('Show or hide the list of everything on the plan'), history, notes }));

  await page.getByRole('button', { name: '3D', exact: true }).click();
  await expect(page.getByRole('region', { name: '3D floor plan viewer' })).toBeVisible({ timeout: 60_000 });
  const lighting = button('Lighting Controls');
  expectApart(await boxes({ help, history, notes, lighting }));

  await lighting.click();
  await expect(lighting).toHaveAttribute('aria-expanded', 'true');
});
