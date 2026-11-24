/**
 * Turns raw touches into gestures: a tap, a double tap, a long press, a one-finger drag or a
 * two-finger pinch. Nothing is pressed until the finger has moved past the slop or lifted, so a
 * pinch never presses what its first finger landed on. Pure: no DOM, and time comes from a clock.
 */

export interface TouchSample { id: number; x: number; y: number }   // client px
export type GestureEvent =
  | { type: 'tap'; x: number; y: number; count: 1 | 2 }
  | { type: 'longPress'; x: number; y: number }
  | { type: 'dragStart'; x: number; y: number }                      // where the finger landed
  | { type: 'dragMove'; x: number; y: number }
  | { type: 'dragEnd'; x: number; y: number; cancelled: boolean }
  | { type: 'pinchStart' }
  | { type: 'pinchMove'; centerX: number; centerY: number; scale: number; dx: number; dy: number }
  | { type: 'pinchEnd' };
export interface GestureOptions { slop: number; longPressMs: number; doubleTapMs: number; doubleTapSlop: number }
export const DEFAULT_GESTURES: GestureOptions = { slop: 10, longPressMs: 500, doubleTapMs: 350, doubleTapSlop: 30 };
export interface GestureClock { now(): number; setTimeout(fn: () => void, ms: number): unknown; clearTimeout(handle: unknown): void }
export interface TouchGestures {
  start(touches: TouchSample[]): void;                        // every finger now down
  move(touches: TouchSample[]): void;
  end(touches: TouchSample[], lifted: TouchSample[]): void;   // fingers still down, fingers that lifted
  cancel(): void;
}

const SYSTEM_CLOCK: GestureClock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

type State = 'idle' | 'pending' | 'dragging' | 'pinching' | 'spent';

export function createTouchGestures(emit: (event: GestureEvent) => void, options: Partial<GestureOptions> = {}, clock: GestureClock = SYSTEM_CLOCK): TouchGestures {
  const opts: GestureOptions = { ...DEFAULT_GESTURES, ...options };
  let state: State = 'idle';
  /** The one finger of a press or drag. */
  let finger: { id: number; x: number; y: number; time: number } | null = null;
  /** Where the dragged finger was last seen. */
  let last = { x: 0, y: 0 };
  let timer: unknown = null;
  /** The tap before this one, while a second could make it a double tap. */
  let lastTap: { time: number; x: number; y: number } | null = null;
  /** Gap and centre of the first two fingers at the last pinch call. */
  let pinch = { gap: 0, cx: 0, cy: 0 };

  function stopTimer() {
    if (timer !== null) clock.clearTimeout(timer);
    timer = null;
  }

  function measure(touches: TouchSample[]) {
    const [a, b] = touches;
    return { gap: Math.hypot(b.x - a.x, b.y - a.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
  }

  function startPinch(touches: TouchSample[]) {
    stopTimer();
    emit({ type: 'pinchStart' });
    pinch = measure(touches);
    lastTap = null;
    state = 'pinching';
  }

  /** The remembered finger in a list, by id. */
  const mine = (touches: TouchSample[]) => (finger ? touches.find(t => t.id === finger!.id) : undefined);

  return {
    start(touches) {
      if (!touches.length) return;
      if (state === 'idle') {
        if (touches.length >= 2) { startPinch(touches); return; }
        const t = touches[0];
        finger = { id: t.id, x: t.x, y: t.y, time: clock.now() };
        last = { x: t.x, y: t.y };
        state = 'pending';
        timer = clock.setTimeout(() => {
          timer = null;
          if (state !== 'pending' || !finger) return;
          lastTap = null;
          state = 'spent';
          emit({ type: 'longPress', x: finger.x, y: finger.y });
        }, opts.longPressMs);
        return;
      }
      if (state === 'pending' && touches.length >= 2) { startPinch(touches); return; }
      // A finger joining a pinch: measure from the fingers as they are now, so nothing jumps.
      if (state === 'pinching' && touches.length >= 2) pinch = measure(touches);
    },

    move(touches) {
      if (state === 'pending' && finger) {
        const t = mine(touches) ?? (touches.length === 1 ? touches[0] : undefined);
        if (!t || Math.hypot(t.x - finger.x, t.y - finger.y) <= opts.slop) return;
        stopTimer();
        state = 'dragging';
        last = { x: t.x, y: t.y };
        emit({ type: 'dragStart', x: finger.x, y: finger.y });
        emit({ type: 'dragMove', x: t.x, y: t.y });
        return;
      }
      if (state === 'dragging') {
        const t = mine(touches);
        if (!t) return;
        last = { x: t.x, y: t.y };
        emit({ type: 'dragMove', x: t.x, y: t.y });
        return;
      }
      if (state === 'pinching' && touches.length >= 2) {
        const now = measure(touches);
        const scale = pinch.gap === 0 ? 1 : now.gap / pinch.gap;
        emit({ type: 'pinchMove', centerX: now.cx, centerY: now.cy, scale, dx: now.cx - pinch.cx, dy: now.cy - pinch.cy });
        pinch = now;
      }
    },

    end(touches, lifted) {
      if (state === 'pending') {
        if (touches.length) return;
        stopTimer();
        const t = mine(lifted) ?? lifted[0] ?? finger!;
        const now = clock.now();
        const double = !!lastTap && now - lastTap.time < opts.doubleTapMs && Math.hypot(t.x - lastTap.x, t.y - lastTap.y) < opts.doubleTapSlop;
        lastTap = double ? null : { time: now, x: t.x, y: t.y };
        state = 'idle';
        finger = null;
        emit({ type: 'tap', x: t.x, y: t.y, count: double ? 2 : 1 });
        return;
      }
      if (state === 'dragging') {
        const t = mine(lifted);
        if (!t && mine(touches)) return;   // another finger lifted
        const at = t ?? last;
        lastTap = null;
        state = touches.length ? 'spent' : 'idle';
        finger = null;
        emit({ type: 'dragEnd', x: at.x, y: at.y, cancelled: false });
        return;
      }
      if (state === 'pinching') {
        if (touches.length >= 2) { pinch = measure(touches); return; }
        lastTap = null;
        state = touches.length ? 'spent' : 'idle';
        emit({ type: 'pinchEnd' });
        return;
      }
      if (state === 'spent' && !touches.length) state = 'idle';
    },

    cancel() {
      stopTimer();
      const was = state;
      state = 'idle';
      finger = null;
      if (was === 'pending') lastTap = null;
      else if (was === 'dragging') { lastTap = null; emit({ type: 'dragEnd', x: last.x, y: last.y, cancelled: true }); }
      else if (was === 'pinching') emit({ type: 'pinchEnd' });
      // A cancel lifts every finger, so a spent press is over too.
    },
  };
}
