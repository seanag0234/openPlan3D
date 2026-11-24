import { expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { savedProjects } from './storage';

export const ROOM_WITH_BOXES = 'tests/fixtures/room-with-boxes.openplan.json';

/**
 * Put a plan file in the library once, as a plan saved earlier, and open it in the editor. Opening through the
 * library keeps reload specs away from importing into an editor that is still creating its first plan.
 */
export async function openStored(page: Page, file = ROOM_WITH_BOXES): Promise<any> {
  const plan = JSON.parse(await readFile(file, 'utf8'));
  await page.addInitScript(plan => {
    if (!localStorage.getItem('qaSavingSeeded')) {
      localStorage.setItem('floorplan_projects', JSON.stringify({ [plan.id]: JSON.stringify(plan) }));
      localStorage.setItem('qaSavingSeeded', 'true');
    }
    localStorage.setItem('hasSeenWelcome', 'true');
    localStorage.setItem('o3d_tips_seen', JSON.stringify(['first-wall', 'first-furniture', 'first-3d', 'first-export', 'first-door']));
  }, plan);
  await page.goto(`/editor?id=${plan.id}`);
  await expect(page.getByRole('button', { name: plan.name, exact: true })).toBeVisible();
  return plan;
}

/** The plan as the library holds it. */
export async function stored(page: Page, id: string): Promise<any> {
  const plan = (await savedProjects(page))[id];
  expect(plan, 'the plan is in the library').toBeTruthy();
  return plan;
}

/** Box A's x in the stored plan. */
export async function storedBoxAX(page: Page, id: string): Promise<number> {
  return (await stored(page, id)).floors[0].furniture.find((item: any) => item.id === 'box-a').position.x;
}

/** The Undo steps the browser keeps for each plan, by plan id. */
export async function journals(page: Page): Promise<Record<string, any>> {
  return page.evaluate(() => new Promise(resolve => {
    const open = indexedDB.open('openplan3d-undo', 1);
    open.onupgradeneeded = () => { open.result.createObjectStore('journal'); };
    open.onerror = () => resolve({});
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction('journal', 'readonly'), store = tx.objectStore('journal');
      const keys = store.getAllKeys(), values = store.getAll();
      tx.oncomplete = () => { db.close(); resolve(Object.fromEntries(keys.result.map((key, i) => [String(key), JSON.parse(values.result[i])]))); };
      tx.onabort = () => { db.close(); resolve({}); };
    };
  }));
}

/** Press on Box A with the mouse and drag it `dx` screen px to the right. */
export async function mouseDrag(page: Page, from: { x: number; y: number }, dx: number) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y, { steps: 10 });
  await page.mouse.up();
}

/** Reload, accepting the browser's "leave this page" question when it is asked. */
export async function reloadEditor(page: Page, name: string) {
  const accept = (dialog: import('@playwright/test').Dialog) => void dialog.accept();
  page.on('dialog', accept);
  await page.reload();
  page.off('dialog', accept);
  await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
}

/** Open the list of versions, through "More actions" where the bar folds it away. */
export async function openVersions(page: Page) {
  const more = page.getByRole('button', { name: 'More actions', exact: true });
  if (await more.isVisible()) await more.click();
  await page.getByRole('button', { name: 'Version History', exact: true }).click();
  return page.getByRole('dialog', { name: 'Version History', exact: true });
}
