// Tips as you go. A guide tip shows at most once a visit, on every visit, until tips are turned off.
// A tip about a new feature shows once per browser, tips on or off. Any tip named in `o3d_tips_seen` never shows.
const STORAGE_KEY = 'o3d_tips_seen';
const OFF_KEY = 'o3d_tips_off';

export type TipId =
  | 'first-wall' | 'first-furniture' | 'first-3d' | 'first-export' | 'first-door'
  | 'welcome' | 'pick' | 'changed' | 'details' | 'things' | 'note' | 'new-tour';

/** Every tip and its kind. A new feature's tip is one row here, its words, and one `triggerTip` where it is used. */
export const TIPS: Record<TipId, 'guide' | 'new'> = {
  'first-wall': 'guide',
  'first-furniture': 'guide',
  'first-3d': 'guide',
  'first-export': 'guide',
  'first-door': 'guide',
  welcome: 'guide',
  pick: 'guide',
  changed: 'guide',
  details: 'guide',
  things: 'guide',
  note: 'guide',
  'new-tour': 'new',
};

// Shown this visit, and tips about new features dismissed even when storage could not record it.
const seenThisSession = new Set<TipId>();

function getSeenTips(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function persist(seen: Set<string>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...seen])); } catch { /* Dismissal still lasts for this session. */ }
}

function readOn(): boolean {
  try { return localStorage.getItem(OFF_KEY) === null; } catch { return true; }
}

let _on = $state(readOn());

/** Whether guide tips show. Tips about new features show either way. */
export function tipsOn() { return _on; }

export function setTipsOn(on: boolean) {
  _on = on;
  try { if (on) localStorage.removeItem(OFF_KEY); else localStorage.setItem(OFF_KEY, '1'); } catch { /* Holds for this visit. */ }
  if (!on && _activeTip && TIPS[_activeTip.id] === 'guide') _activeTip = null;
}

/** Returns true if the tip may show now */
export function showTip(tipId: TipId): boolean {
  if (seenThisSession.has(tipId) || getSeenTips().has(tipId)) return false;
  return TIPS[tipId] === 'new' || _on;
}

/** Mark a tip as seen: for this visit, and for good when it is about a new feature */
export function markTipSeen(tipId: TipId): void {
  seenThisSession.add(tipId);
  if (TIPS[tipId] !== 'new') return;
  const seen = getSeenTips();
  seen.add(tipId);
  persist(seen);
}

// Svelte 5 reactive state for the currently active tip. `near` is a point the tip sits beside, clear of it.
let _activeTip = $state<{ id: TipId; x: number; y: number; near?: { x: number; y: number } } | null>(null);

export function getActiveTip() { return _activeTip; }

/** Trigger a tip at a screen position. False when it may not show now. */
export function triggerTip(tipId: TipId, x: number, y: number, near?: { x: number; y: number }): boolean {
  if (!showTip(tipId)) return false;
  _activeTip = near ? { id: tipId, x, y, near } : { id: tipId, x, y };
  return true;
}

/** A tip on its own: low and centred on the plan. */
export function triggerPlanTip(tipId: TipId): boolean {
  return triggerTip(tipId, innerWidth / 2 - 140, innerHeight - 200);
}

// Where a finger or the pointer last came down or lifted, so a tip about what she just did sits beside it.
let lastTouch: { x: number; y: number } | null = null;
if (typeof window !== 'undefined') {
  const note = (e: PointerEvent) => { lastTouch = { x: e.clientX, y: e.clientY }; };
  addEventListener('pointerdown', note, { capture: true, passive: true });
  addEventListener('pointerup', note, { capture: true, passive: true });
}

/** A tip about what she just touched, beside where she touched it; low and centred when nothing was. */
export function triggerTipNearTouch(tipId: TipId): boolean {
  return lastTouch ? triggerTip(tipId, lastTouch.x, lastTouch.y, lastTouch) : triggerPlanTip(tipId);
}

/** Dismiss the current tip */
export function dismissTip() {
  if (_activeTip) {
    const { id } = _activeTip;
    // Close first: recording the tip must never keep it on screen.
    _activeTip = null;
    markTipSeen(id);
  }
}
