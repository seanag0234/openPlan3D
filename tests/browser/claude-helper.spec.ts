import { expect, test, type Page, type Route } from '@playwright/test';
import { ipadLandscape, openPlan, savedPlan } from './touch';

test.use(ipadLandscape);

const message = (content: unknown[], stop_reason: string) => ({
  id: `msg_${Math.random().toString(36).slice(2)}`, type: 'message', role: 'assistant', model: 'claude-opus-5-5',
  content, stop_reason, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 },
});
const replies = [
  message([{ type: 'tool_use', id: 'tu_1', name: 'read_plan', input: {} }], 'tool_use'),
  message([{ type: 'text', text: 'Box A can go beside Box B.' }, { type: 'tool_use', id: 'tu_2', name: 'change_plan',
    input: { summary: 'Move Box A next to Box B.', changes: [{ id: 'box-a', x: 10 }] } }], 'tool_use'),
  message([{ type: 'text', text: 'Done: Box A is beside Box B now.' }], 'end_turn'),
];

/** Stands in for the provider: answers each request with the next reply, and keeps what was sent. */
async function fakeProvider(page: Page, url: string) {
  const sent: { headers: Record<string, string>; body: any }[] = [];
  await page.route(url, async (route: Route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
    sent.push({ headers: await route.request().allHeaders(), body: route.request().postDataJSON() });
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(replies[sent.length - 1]) });
  });
  return sent;
}

async function ask(page: Page, key: string, question: string) {
  // A made-up key: the provider here is the fake above.
  await page.addInitScript(k => localStorage.setItem('o3d_claude_settings', JSON.stringify({ apiKey: k, model: 'opus' })), key);
  await openPlan(page, 'tests/fixtures/room-with-boxes.openplan.json');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Ask Claude', exact: true }).tap();
  const panel = page.getByRole('region', { name: 'Ask Claude' });
  await panel.getByRole('textbox').fill(question);
  await panel.getByRole('button', { name: 'Send' }).tap();
  return panel;
}

test('Claude reads the plan, proposes a move, and it happens only after Do it, as one Undo step', async ({ page }) => {
  const sent = await fakeProvider(page, 'https://api.anthropic.com/v1/messages*');
  const panel = await ask(page, 'sk-ant-test', 'Put Box A next to Box B');

  const change = panel.getByTestId('claude-change');
  await expect(change).toContainText('Move Box A next to Box B.');
  await expect(panel).toContainText('Box A can go beside Box B.');
  expect((await savedPlan(page)).floors[0].furniture.find((f: any) => f.id === 'box-a').position.x).toBe(150);
  await page.keyboard.press('Escape');

  await change.getByRole('button', { name: 'Do it' }).tap();
  await expect(change).toContainText('Done. Undo puts it back.');
  await expect(panel).toContainText('Done: Box A is beside Box B now.');
  expect((await savedPlan(page)).floors[0].furniture.find((f: any) => f.id === 'box-a').position.x).toBeCloseTo(304.8);
  await page.keyboard.press('Escape');

  // What went to the provider: her words, the plan in feet, the model and the tools, from the browser.
  expect(sent).toHaveLength(3);
  expect(sent[0].body).toMatchObject({ model: 'claude-opus-5-5', fallbacks: 'default', output_config: { effort: 'medium' } });
  expect(sent[0].body.tools.map((t: any) => t.name)).toEqual(['read_plan', 'change_plan']);
  expect(sent[0].body.messages).toEqual([{ role: 'user', content: 'Put Box A next to Box B' }]);
  expect(sent[0].headers.authorization).toBe('Bearer sk-ant-test');
  expect(sent[0].headers['anthropic-dangerous-direct-browser-access']).toBe('true');
  const plan = JSON.parse(sent[1].body.messages[2].content[0].content);
  expect(plan.pieces.find((p: any) => p.id === 'box-a')).toMatchObject({ name: 'Box A', x: 4.9 });

  await page.locator('[data-tour="undo"]').tap();
  await expect.poll(async () => (await savedPlan(page)).floors[0].furniture.find((f: any) => f.id === 'box-a').position.x).toBe(150);
});

test('No leaves the plan as it was, and an OpenRouter key goes to OpenRouter', async ({ page }) => {
  const sent = await fakeProvider(page, 'https://openrouter.ai/api/v1/messages*');
  const panel = await ask(page, 'sk-or-test', 'Put Box A next to Box B');
  const change = panel.getByTestId('claude-change');
  await change.getByRole('button', { name: 'No' }).tap();
  await expect(change).toContainText('Left as it was.');
  expect((await savedPlan(page)).floors[0].furniture.find((f: any) => f.id === 'box-a').position.x).toBe(150);
  expect(sent[0].body.model).toBe('anthropic/claude-opus-5.5');
  expect(sent[0].body.fallbacks).toBeUndefined();
  expect(sent[0].headers.authorization).toBe('Bearer sk-or-test');
  expect(sent[2].body.messages.at(-1).content[0]).toMatchObject({ type: 'tool_result', tool_use_id: 'tu_2', content: expect.stringContaining('No') });
});
