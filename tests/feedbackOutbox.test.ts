import './fixtures/indexeddb';
import { expect, it, vi } from 'vitest';
import { flushFeedback, pendingFeedback, queueFeedback, removeFeedback, feedbackEnabled, type FeedbackMessage } from '$lib/services/feedbackOutbox';

const message = (n: number): FeedbackMessage => ({
  id: `0000000${n}-0000-4000-8000-000000000000`, createdAt: new Date(2026, 10, 24, 14, n).toISOString(),
  text: `Made-up wish ${n}`, about: null, planName: 'Made-up flat', context: { view: '2d' }, picture: null,
});

it('keeps what is queued until it is removed', async () => {
  await queueFeedback(message(2));
  await queueFeedback(message(1));
  expect((await pendingFeedback()).map(m => m.id)).toEqual([message(1).id, message(2).id]);
  expect((await pendingFeedback())[0]).toEqual(message(1));
  await removeFeedback(message(1).id);
  expect((await pendingFeedback()).map(m => m.id)).toEqual([message(2).id]);
});

it('a delivered message leaves the outbox, oldest first', async () => {
  await queueFeedback(message(2));
  await queueFeedback(message(1));
  const sent: string[] = [];
  const result = await flushFeedback(async m => { sent.push(m.id); return 201; });
  expect(sent).toEqual([message(1).id, message(2).id]);
  expect(result).toEqual({ sent: 2, waiting: 0 });
  expect(await pendingFeedback()).toEqual([]);
});

it('a duplicate answered 200 leaves too', async () => {
  await queueFeedback(message(1));
  expect(await flushFeedback(async () => 200)).toEqual({ sent: 1, waiting: 0 });
});

it('no connection, or a copy that cannot take it now, keeps the message', async () => {
  await queueFeedback(message(1));
  for (const status of [0, 503, 429, 500, 403]) {
    expect(await flushFeedback(async () => status)).toEqual({ sent: 0, waiting: 1 });
  }
  expect((await pendingFeedback()).map(m => m.id)).toEqual([message(1).id]);
});

it('a message the copy can never take (400) is dropped', async () => {
  await queueFeedback(message(1));
  await queueFeedback(message(2));
  const result = await flushFeedback(async m => m.id === message(1).id ? 400 : 503);
  expect(result).toEqual({ sent: 0, waiting: 1 });
  expect((await pendingFeedback()).map(m => m.id)).toEqual([message(2).id]);
});

it('two flushes at once deliver a message once', async () => {
  await queueFeedback(message(1));
  const post = vi.fn(async () => { await new Promise(resolve => setTimeout(resolve, 20)); return 201; });
  const [a, b] = await Promise.all([flushFeedback(post), flushFeedback(post)]);
  expect(post).toHaveBeenCalledTimes(1);
  expect(a.sent + b.sent).toBe(1);
  expect(b.waiting).toBe(0);
});

it('a failing post is a message kept, not an error', async () => {
  await queueFeedback(message(1));
  expect(await flushFeedback(async () => { throw new Error('offline'); })).toEqual({ sent: 0, waiting: 1 });
});

it('feedback is on only when the copy says so', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ enabled: true }))));
  expect(await feedbackEnabled()).toBe(true);
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ enabled: false }))));
  expect(await feedbackEnabled()).toBe(false);
  vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>', { status: 404 })));
  expect(await feedbackEnabled()).toBe(false);
  vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
  expect(await feedbackEnabled()).toBe(false);
});

it('by default posts the message as JSON to the copy and reads the status', async () => {
  const fetch = vi.fn(async () => new Response('{"ok":true}', { status: 201 }));
  vi.stubGlobal('fetch', fetch);
  await queueFeedback(message(1));
  expect(await flushFeedback()).toEqual({ sent: 1, waiting: 0 });
  const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe('/api/feedback');
  expect(init.method).toBe('POST');
  expect(JSON.parse(init.body as string)).toEqual(message(1));
  vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
  await queueFeedback(message(2));
  expect(await flushFeedback()).toEqual({ sent: 0, waiting: 1 });
});
