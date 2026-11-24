import { expect, test, type TestInfo } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { labels, openPlan, recordLabels, where } from './touch';

const FIXTURE = 'tests/fixtures/room-with-boxes.openplan.json';

/** A copy of the room with boxes, changed by `edit`, written where this test keeps its files. */
async function planWith(testInfo: TestInfo, edit: (plan: any) => void): Promise<string> {
  const plan = JSON.parse(await readFile(FIXTURE, 'utf8'));
  edit(plan);
  const file = testInfo.outputPath('plan.json');
  await writeFile(file, JSON.stringify(plan));
  return file;
}

const piece = (plan: any, id: string) => plan.floors[0].furniture.find((item: any) => item.id === id);

test('names and sizes of pieces close together do not run into each other', async ({ page }, testInfo) => {
  await recordLabels(page);
  // Box B stands over Box A, so each piece's own caption place lands on its neighbour's.
  await openPlan(page, await planWith(testInfo, plan => { piece(plan, 'box-b').position = { x: 160, y: 215 }; }));
  await page.keyboard.press('Escape');
  await where(page, 'Box A');
  await where(page, 'Box B');
  const drawn = (await labels(page)).filter(line => ['Box A', 'Box B', 'Rug'].includes(line.text) || line.text.includes(' × '));
  expect(drawn.map(line => line.text)).toEqual(expect.arrayContaining(['Box A', 'Box B']));
  const boxOf = (line: { text: string; x: number; y: number }) => {
    const half = line.text.length * 6.6 / 2;
    return { left: line.x - half, right: line.x + half, top: line.y - 7.5, bottom: line.y + 7.5 };
  };
  for (let i = 0; i < drawn.length; i++) for (let j = i + 1; j < drawn.length; j++) {
    const a = boxOf(drawn[i]), b = boxOf(drawn[j]);
    const across = Math.min(a.right, b.right) - Math.max(a.left, b.left), down = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    expect(across > 1 && down > 1, `"${drawn[i].text}" and "${drawn[j].text}" overlap`).toBe(false);
  }
});

test('a piece standing alone keeps its name and size where they were', async ({ page }) => {
  await recordLabels(page);
  await openPlan(page, FIXTURE);
  await page.keyboard.press('Escape');
  const name = await where(page, 'Box A');
  const size = (await labels(page)).find(line => line.text.includes(' × ') && Math.abs(line.x - name.x) < 0.5 && line.y > name.y);
  expect(size).toBeDefined();
  expect(size!.y - name.y).toBeCloseTo(15, 3);
});
