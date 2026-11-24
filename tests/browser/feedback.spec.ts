import { expect, test, type Page, type Route } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { ipadLandscape, openPlan, recordLabels, where } from './touch';
import { openList } from './list';

test.use(ipadLandscape);

const sentence = 'The made-up box will not turn on my tablet.';

/** The copy's feedback route: `post` answers each message; GET says whether feedback is on. */
async function feedbackRoute(page: Page, enabled: boolean, post: (route: Route) => Promise<void>) {
  await page.unroute('**/api/feedback');
  await page.route('**/api/feedback', route => route.request().method() === 'GET'
    ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ enabled }) })
    : post(route));
}

async function openOnBoxA(page: Page) {
  await recordLabels(page);
  await openPlan(page, 'tests/fixtures/room-with-boxes.openplan.json');
  await page.keyboard.press('Escape');
  const box = await where(page, 'Box A');
  await page.touchscreen.tap(box.x, box.y);
}

async function writeAndSend(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new Event('o3d-feedback')));
  const sheet = page.getByRole('dialog', { name: 'What is wrong, or what do you wish for?' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Send' })).toBeDisabled();
  await sheet.getByRole('textbox', { name: 'Your words' }).fill(sentence);
  await sheet.getByRole('button', { name: 'Send' }).tap();
  return sheet;
}

test('feedback from the editor carries the words, what is selected, a picture and where it was written', async ({ page }) => {
  const posted: any[] = [];
  await feedbackRoute(page, true, async route => { posted.push(route.request().postDataJSON()); await route.fulfill({ status: 201, contentType: 'application/json', body: '{"ok":true}' }); });
  await openOnBoxA(page);
  await page.evaluate(() => window.dispatchEvent(new Event('o3d-feedback')));
  const sheet = page.getByRole('dialog', { name: 'What is wrong, or what do you wish for?' });
  await expect(sheet.getByText('About: Box A')).toBeVisible();
  await expect(sheet.getByRole('checkbox', { name: 'Include a picture of the plan' })).toBeChecked();
  const words = sheet.getByRole('textbox', { name: 'Your words' });
  expect(await words.evaluate(element => getComputedStyle(element).fontSize)).toBe('16px');
  for (const name of ['Send', 'Cancel']) expect((await sheet.getByRole('button', { name }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await words.fill(sentence);
  await sheet.getByRole('button', { name: 'Send' }).tap();
  await expect(sheet.getByRole('status')).toHaveText('Sent. Thank you.');
  expect(posted).toHaveLength(1);
  expect(posted[0].text).toBe(sentence);
  expect(posted[0].about).toBe('Box A');
  expect(posted[0].planName).toBe('Room with boxes');
  expect(posted[0].picture).toMatch(/^data:image\/jpeg;base64,/);
  expect(posted[0].picture.length).toBeLessThan(400_000);
  expect(posted[0].context.view).toBe('2d');
  expect(posted[0].context.coarse).toBe(true);
  expect(posted[0].id).toMatch(/^[0-9a-f-]{36}$/);
});

test('without a connection the message waits on the device and goes when the connection is back', async ({ page }) => {
  await feedbackRoute(page, true, route => route.abort());
  await openOnBoxA(page);
  const sheet = await writeAndSend(page);
  await expect(sheet.getByRole('status')).toHaveText('Kept on this device. It will be sent when the connection is back.');
  await expect(sheet.getByText('1 waiting to be sent')).toBeVisible();

  const posted: any[] = [];
  await feedbackRoute(page, true, async route => { posted.push(route.request().postDataJSON()); await route.fulfill({ status: 201, body: '{"ok":true}' }); });
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(sheet.getByText('1 waiting to be sent')).toHaveCount(0);
  expect(posted.map(message => message.text)).toEqual([sentence]);
});

test('a copy that takes no feedback lets the words be saved as a file', async ({ page }) => {
  await feedbackRoute(page, false, route => route.fulfill({ status: 503, body: '{"error":"off"}' }));
  await openOnBoxA(page);
  const sheet = await writeAndSend(page);
  await expect(sheet.getByRole('status')).toHaveText('This copy of the editor has nowhere to send feedback.');
  const download = page.waitForEvent('download');
  await sheet.getByRole('button', { name: 'Save as a file' }).tap();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^feedback-\d{4}-\d{2}-\d{2}\.txt$/);
  expect(await readFile((await file.path())!, 'utf8')).toContain(sentence);
  await expect(sheet.getByText(/waiting to be sent/)).toHaveCount(0);
});

test('the list of plans has a Feedback link, and its sheet offers no picture', async ({ page }) => {
  await feedbackRoute(page, true, route => route.fulfill({ status: 201, body: '{"ok":true}' }));
  await page.addInitScript(() => localStorage.setItem('hasSeenWelcome', 'true'));
  await openList(page);
  await page.getByRole('button', { name: 'Feedback', exact: true }).tap();
  const sheet = page.getByRole('dialog', { name: 'What is wrong, or what do you wish for?' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('checkbox')).toHaveCount(0);
  await sheet.getByRole('button', { name: 'Cancel' }).tap();
  await expect(sheet).toHaveCount(0);
});

test('written with no connection at all, the message is said to be kept, and goes when the connection is back', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('hasSeenWelcome', 'true'));
  await openList(page);
  await page.context().setOffline(true);
  await page.getByRole('button', { name: 'Feedback', exact: true }).tap();
  const sheet = page.getByRole('dialog', { name: 'What is wrong, or what do you wish for?' });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('textbox', { name: 'Your words' }).fill(sentence);
  await sheet.getByRole('button', { name: 'Send' }).tap();
  await expect(sheet.getByRole('status')).toHaveText('Kept on this device. It will be sent when the connection is back.');
  await expect(sheet.getByRole('button', { name: 'Share' })).toHaveCount(0);
  await expect(sheet.getByRole('button', { name: 'Save as a file' })).toHaveCount(0);
  await expect(sheet.getByText('1 waiting to be sent')).toBeVisible();

  const posted: any[] = [];
  await page.route('**/api/feedback', route => {
    if (route.request().method() !== 'POST') return route.fallback();
    posted.push(route.request().postDataJSON());
    return route.fulfill({ status: 201, contentType: 'application/json', body: '{"ok":true}' });
  });
  await page.context().setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(sheet.getByText(/waiting to be sent/)).toHaveCount(0);
  expect(posted.map(message => message.text)).toEqual([sentence]);
});
