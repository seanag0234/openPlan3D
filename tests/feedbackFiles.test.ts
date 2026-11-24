import { afterEach, beforeEach, expect, it } from 'vitest';
import { mkdtemp, readdir, readFile, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FEEDBACK_LIMITS, FeedbackRejected, writeFeedback } from '$lib/server/feedbackFiles';

let dir = '';
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'feedback-')); });
afterEach(() => rm(dir, { recursive: true, force: true }));

/** A tiny JPEG: the three bytes every JPEG starts with, and a little more. */
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
const picture = `data:image/jpeg;base64,${jpeg.toString('base64')}`;
const now = new Date(2026, 10, 24, 14, 3, 5);
const stamp = '2026-11-24-140305';

function message(overrides: Record<string, unknown> = {}) {
  return {
    id: '1a2b3c4d-0000-4000-8000-000000000001',
    createdAt: now.toISOString(),
    text: 'The box will not turn.\nI tried twice.',
    about: 'Box A',
    planName: 'Made-up flat',
    context: { page: '/editor', view: '2d', zoom: 1.5, coarse: true },
    picture,
    ...overrides,
  };
}

async function rejection(body: unknown, at = now, limits = FEEDBACK_LIMITS, folder = dir) {
  try { await writeFeedback(folder, body, at, limits); }
  catch (error) { expect(error).toBeInstanceOf(FeedbackRejected); return (error as FeedbackRejected).status; }
  throw new Error('was not rejected');
}

it('writes one Markdown file and one picture, named by the time and the id', async () => {
  const result = await writeFeedback(dir, message(), now);
  expect(result).toEqual({ file: `${stamp}-1a2b3c4d.md`, duplicate: false });
  expect((await readdir(dir)).sort()).toEqual([`${stamp}-1a2b3c4d.jpg`, `${stamp}-1a2b3c4d.md`]);
  expect(await readFile(join(dir, `${stamp}-1a2b3c4d.jpg`))).toEqual(jpeg);
  const md = await readFile(join(dir, `${stamp}-1a2b3c4d.md`), 'utf8');
  expect(md).toBe([
    '---',
    'title: "Feedback 2026-11-24 14:03"',
    'date: 2026-11-24',
    'id: "1a2b3c4d-0000-4000-8000-000000000001"',
    'status: new',
    'about: "Box A"',
    'plan: "Made-up flat"',
    `picture: "${stamp}-1a2b3c4d.jpg"`,
    'tags:',
    '  - feedback',
    '---',
    '',
    '> The box will not turn.',
    '> I tried twice.',
    '',
    '## Where this was written',
    '',
    '- page: /editor',
    '- view: 2d',
    '- zoom: 1.5',
    '- coarse: true',
    '',
  ].join('\n'));
});

it('writes no picture file when there is no picture, and makes the folder', async () => {
  const folder = join(dir, 'new', 'inbox');
  const result = await writeFeedback(folder, message({ picture: null, about: null, planName: null }), now);
  expect(await readdir(folder)).toEqual([result.file]);
  const md = await readFile(join(folder, result.file), 'utf8');
  expect(md).toContain('about: null\nplan: null\npicture: null\n');
});

it('the same message again writes nothing and says it is a duplicate', async () => {
  const first = await writeFeedback(dir, message(), now);
  const again = await writeFeedback(dir, message(), new Date(now.getTime() + 60_000));
  expect(again).toEqual({ file: first.file, duplicate: true });
  expect(await readdir(dir)).toHaveLength(2);
});

it('refuses with 503 when the folder is not an absolute path', async () => {
  expect(await rejection(message(), now, FEEDBACK_LIMITS, 'feedback')).toBe(503);
  expect(await rejection(message(), now, FEEDBACK_LIMITS, '')).toBe(503);
});

it('refuses each malformed part with 400', async () => {
  const bad: Record<string, unknown>[] = [
    { id: 'short' }, { id: '../../etc/passwd' }, { id: 'zzzzzzzzzz' }, { id: '--------' }, { id: 12345678 },
    { text: '' }, { text: '   \n ' }, { text: 'x'.repeat(FEEDBACK_LIMITS.maxText + 1) }, { text: 5 },
    { about: 5 }, { planName: {} },
    { context: [] }, { context: null }, { context: 'view' },
    { context: Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`k${'a'.repeat(i % 5)}x${String.fromCharCode(97 + i)}`, 1])) },
    { context: { 'bad-key': 1 } }, { context: { ['a'.repeat(21)]: 1 } }, { context: { zoom: Infinity } }, { context: { nested: {} } },
    { picture: 'data:image/png;base64,iVBORw0KGgo=' },
    { picture: `data:image/jpeg;base64,${Buffer.from('not a jpeg').toString('base64')}` },
    { picture: `data:image/jpeg;base64,${Buffer.concat([jpeg, Buffer.alloc(FEEDBACK_LIMITS.maxPictureBytes)]).toString('base64')}` },
    { picture: 5 },
  ];
  for (const overrides of bad) expect(await rejection(message(overrides)), JSON.stringify(overrides).slice(0, 80)).toBe(400);
  expect(await rejection(null)).toBe(400);
  expect(await rejection('text')).toBe(400);
  expect(await readdir(dir)).toEqual([]);
});

it('takes a message of exactly the longest text, trimmed', async () => {
  const result = await writeFeedback(dir, message({ text: `  ${'y'.repeat(FEEDBACK_LIMITS.maxText)}  ` }), now);
  expect(await readFile(join(dir, result.file), 'utf8')).toContain(`> ${'y'.repeat(FEEDBACK_LIMITS.maxText)}\n`);
});

it('nothing in the body reaches a name or breaks the front matter', async () => {
  const about = '../../evil"\n---\nstatus: done\r\x07' + 'z'.repeat(400);
  const result = await writeFeedback(dir, message({ about, planName: '../plan\nname', context: { view: '2d\n## injected' } }), now);
  expect(result.file).toBe(`${stamp}-1a2b3c4d.md`);
  expect((await readdir(dir)).sort()).toEqual([`${stamp}-1a2b3c4d.jpg`, `${stamp}-1a2b3c4d.md`]);
  const md = await readFile(join(dir, result.file), 'utf8');
  const front = md.split('\n---\n')[0].split('\n');
  expect(front.filter(line => line.startsWith('status:'))).toEqual(['status: new']);
  const aboutLine = front.find(line => line.startsWith('about: '))!;
  const parsed = JSON.parse(aboutLine.slice('about: '.length));
  expect(parsed.length).toBe(200);
  expect(parsed).not.toMatch(/[\n\r\x00-\x1f]/);
  expect(front.find(line => line.startsWith('plan: '))).toBe('plan: "../plan name"');
  expect(md).toContain('- view: 2d ## injected\n');
  expect(md.match(/^## /gm)).toHaveLength(1);
});

it('a text line cannot leave its quote', async () => {
  const result = await writeFeedback(dir, message({ text: 'first\n---\n## heading\r\nlast' }), now);
  const md = await readFile(join(dir, result.file), 'utf8');
  expect(md).toContain('> first\n> ---\n> ## heading\n> last\n');
});

it('refuses the 31st message in an hour, and any message once the folder is full', async () => {
  // The hour is read from the files' own times, so this part runs on the real clock.
  const start = Date.now();
  for (let i = 0; i < FEEDBACK_LIMITS.perHour; i++) {
    const id = `${(0x10000000 + i).toString(16)}-0000-4000-8000-000000000000`;
    await writeFeedback(dir, message({ id, picture: null }), new Date(start + i * 1000));
  }
  expect(await rejection(message({ id: 'ffffffff-0000-4000-8000-000000000000' }), new Date(start + 40_000))).toBe(429);

  // An hour on, the folder takes messages again, until it holds maxFiles.
  const later = new Date(Date.now() + 2 * 3600_000);
  for (const name of await readdir(dir)) await utimes(join(dir, name), new Date(Date.now() - 2 * 3600_000), new Date(Date.now() - 2 * 3600_000));
  await writeFeedback(dir, message({ id: 'eeeeeeee-0000-4000-8000-000000000000', picture: null }), later);
  const small = { ...FEEDBACK_LIMITS, maxFiles: FEEDBACK_LIMITS.perHour + 1 };
  expect(await rejection(message({ id: 'dddddddd-0000-4000-8000-000000000000' }), later, small)).toBe(429);
});
