import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockStorage } from './fixtures/indexeddb';

const storage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

beforeEach(() => {
  vi.resetModules();
  // Vitest compiles this runes module as plain TypeScript; an identity $state keeps its module-local behaviour.
  vi.stubGlobal('$state', <T>(initial: T) => initial);
});

afterEach(() => {
  if (storage) Object.defineProperty(globalThis, 'localStorage', storage);
  else Reflect.deleteProperty(globalThis, 'localStorage');
});

const load = () => import('../src/lib/stores/onboarding.svelte');
/** The next visit: the page loads again over the same storage. */
const nextVisit = async () => { vi.resetModules(); return load(); };

describe('onboarding tips', () => {
  it('shows a guide tip once a visit, and again on the next visit, without recording it', async () => {
    const data = mockStorage();
    const tips = await load();
    expect(tips.triggerTip('first-export', 300, 60)).toBe(true);
    expect(tips.getActiveTip()).toEqual({ id: 'first-export', x: 300, y: 60 });
    tips.dismissTip();
    expect(tips.getActiveTip()).toBeNull();
    expect(tips.triggerTip('first-export', 300, 60)).toBe(false);
    expect(data.has('o3d_tips_seen')).toBe(false);
    const next = await nextVisit();
    expect(next.triggerTip('first-export', 300, 60)).toBe(true);
  });

  it('stops guide tips once turned off, on later visits too, until turned on again', async () => {
    const data = mockStorage();
    const tips = await load();
    tips.triggerTip('pick', 300, 60);
    tips.setTipsOn(false);
    expect(tips.getActiveTip()).toBeNull();
    expect(tips.tipsOn()).toBe(false);
    expect(tips.triggerTip('changed', 300, 60)).toBe(false);
    expect(data.get('o3d_tips_off')).toBe('1');
    const next = await nextVisit();
    expect(next.tipsOn()).toBe(false);
    expect(next.triggerTip('pick', 300, 60)).toBe(false);
    next.setTipsOn(true);
    expect(data.has('o3d_tips_off')).toBe(false);
    expect(next.triggerTip('pick', 300, 60)).toBe(true);
  });

  it('shows a tip about a new feature once per browser, even with tips off', async () => {
    const data = mockStorage();
    const tips = await load();
    tips.setTipsOn(false);
    expect(tips.triggerTip('new-tour', 300, 60)).toBe(true);
    tips.setTipsOn(false);
    expect(tips.getActiveTip()).toMatchObject({ id: 'new-tour' });
    tips.dismissTip();
    expect(JSON.parse(data.get('o3d_tips_seen')!)).toEqual(['new-tour']);
    const next = await nextVisit();
    expect(next.triggerTip('new-tour', 300, 60)).toBe(false);
  });

  it('never shows a tip the browser lists as seen', async () => {
    const data = mockStorage();
    data.set('o3d_tips_seen', JSON.stringify(['first-furniture']));
    const tips = await load();
    expect(tips.triggerTip('first-furniture', 300, 60)).toBe(false);
    expect(tips.triggerTip('pick', 300, 60)).toBe(true);
  });

  it('closes a tip that storage cannot record and keeps it closed for the session', async () => {
    const data = mockStorage();
    vi.mocked(localStorage.setItem).mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError'); });
    const tips = await load();
    tips.triggerTip('new-tour', 300, 60);
    expect(() => tips.dismissTip()).not.toThrow();
    expect(tips.getActiveTip()).toBeNull();
    tips.triggerTip('new-tour', 300, 60);
    expect(tips.getActiveTip()).toBeNull();
    // Other tips are unaffected, and turning tips off still holds for the visit.
    tips.triggerTip('first-3d', 200, 80);
    expect(tips.getActiveTip()).toMatchObject({ id: 'first-3d' });
    expect(() => tips.setTipsOn(false)).not.toThrow();
    expect(tips.triggerTip('pick', 200, 80)).toBe(false);
    expect(data.has('o3d_tips_seen')).toBe(false);
  });

  it('shows and dismisses tips in memory when site storage is blocked', async () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() { throw new DOMException('Access is denied for this document.', 'SecurityError'); },
    });
    const tips = await load();
    tips.triggerTip('first-wall', 400, 120);
    expect(tips.getActiveTip()).toMatchObject({ id: 'first-wall' });
    expect(() => tips.dismissTip()).not.toThrow();
    expect(tips.getActiveTip()).toBeNull();
    tips.triggerTip('first-wall', 400, 120);
    expect(tips.getActiveTip()).toBeNull();
  });
});
