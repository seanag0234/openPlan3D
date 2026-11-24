import { describe, expect, it } from 'vitest';
import { createTouchGestures, DEFAULT_GESTURES, type GestureClock, type GestureEvent, type TouchSample } from '$lib/utils/touchGestures';

/** A clock that moves only when the test says so. */
function fakeClock() {
  let time = 1000;
  let nextHandle = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const clock: GestureClock = {
    now: () => time,
    setTimeout(fn, ms) { const handle = nextHandle++; timers.set(handle, { at: time + ms, fn }); return handle; },
    clearTimeout(handle) { timers.delete(handle as number); },
  };
  function advance(ms: number) {
    const until = time + ms;
    for (;;) {
      const due = [...timers].filter(([, t]) => t.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]);
      time = due[1].at;
      due[1].fn();
    }
    time = until;
  }
  return { clock, advance, pending: () => timers.size };
}

function setup() {
  const events: GestureEvent[] = [];
  const time = fakeClock();
  const g = createTouchGestures(e => events.push(e), {}, time.clock);
  const take = () => events.splice(0);
  return { g, events, take, ...time };
}

const f = (id: number, x: number, y: number): TouchSample => ({ id, x, y });

/** One finger down at (100, 100) and kept there: `pending`. */
function pending() {
  const s = setup();
  s.g.start([f(1, 100, 100)]);
  return s;
}
/** One finger down and moved beyond the slop: `dragging`. */
function dragging() {
  const s = pending();
  s.g.move([f(1, 130, 100)]);
  s.take();
  return s;
}
/** Two fingers down, 100 px apart about (150, 100): `pinching`. */
function pinching() {
  const s = setup();
  s.g.start([f(1, 100, 100), f(2, 200, 100)]);
  s.take();
  return s;
}
/** A long press has fired and the finger is still down: `spent`. */
function spent() {
  const s = pending();
  s.advance(DEFAULT_GESTURES.longPressMs);
  s.take();
  return s;
}

describe('touch gestures', () => {
  it('defaults to a 10 px slop, a half-second long press and a 350 ms double tap', () => {
    expect(DEFAULT_GESTURES).toEqual({ slop: 10, longPressMs: 500, doubleTapMs: 350, doubleTapSlop: 30 });
  });

  describe('idle', () => {
    it('one finger down presses nothing yet and starts the long-press timer', () => {
      const s = setup();
      s.g.start([f(1, 100, 100)]);
      expect(s.take()).toEqual([]);
      expect(s.pending()).toBe(1);
    });

    it('two fingers down start a pinch', () => {
      const s = setup();
      s.g.start([f(1, 100, 100), f(2, 200, 100)]);
      expect(s.take()).toEqual([{ type: 'pinchStart' }]);
      s.g.move([f(1, 90, 100), f(2, 210, 100)]);
      expect(s.take()).toEqual([{ type: 'pinchMove', centerX: 150, centerY: 100, scale: 1.2, dx: 0, dy: 0 }]);
    });
  });

  describe('pending', () => {
    it('a move within the slop does nothing', () => {
      const s = pending();
      s.g.move([f(1, 108, 104)]);
      expect(s.take()).toEqual([]);
      s.g.end([], [f(1, 108, 104)]);
      expect(s.take()).toEqual([{ type: 'tap', x: 108, y: 104, count: 1 }]);
    });

    it('a move beyond the slop starts a drag from the landing point', () => {
      const s = pending();
      s.g.move([f(1, 115, 100)]);
      expect(s.take()).toEqual([{ type: 'dragStart', x: 100, y: 100 }, { type: 'dragMove', x: 115, y: 100 }]);
      expect(s.pending()).toBe(0);
    });

    it('a second finger turns it into a pinch', () => {
      const s = pending();
      s.g.start([f(1, 100, 100), f(2, 200, 100)]);
      expect(s.take()).toEqual([{ type: 'pinchStart' }]);
      expect(s.pending()).toBe(0);
    });

    it('a pinch forgets the tap chain', () => {
      const s = setup();
      s.g.start([f(1, 100, 100)]); s.g.end([], [f(1, 100, 100)]);
      s.g.start([f(1, 100, 100)]); s.g.start([f(1, 100, 100), f(2, 200, 100)]);
      s.g.end([f(2, 200, 100)], [f(1, 100, 100)]); s.g.end([], [f(2, 200, 100)]);
      s.take();
      s.g.start([f(3, 100, 100)]); s.g.end([], [f(3, 100, 100)]);
      expect(s.take()).toEqual([{ type: 'tap', x: 100, y: 100, count: 1 }]);
    });

    it('the timer fires a long press at the landing point', () => {
      const s = pending();
      s.g.move([f(1, 105, 100)]);
      s.advance(499);
      expect(s.take()).toEqual([]);
      s.advance(1);
      expect(s.take()).toEqual([{ type: 'longPress', x: 100, y: 100 }]);
      s.g.end([], [f(1, 105, 100)]);
      expect(s.take()).toEqual([]);
    });

    it('a long press forgets the tap chain', () => {
      const s = setup();
      s.g.start([f(1, 100, 100)]); s.g.end([], [f(1, 100, 100)]);
      s.g.start([f(2, 100, 100)]); s.advance(500); s.g.end([], [f(2, 100, 100)]);
      s.take();
      s.g.start([f(3, 100, 100)]); s.g.end([], [f(3, 100, 100)]);
      expect(s.take()).toEqual([{ type: 'tap', x: 100, y: 100, count: 1 }]);
    });

    it('lifting the finger is a tap at the lifted point', () => {
      const s = pending();
      s.g.end([], [f(1, 103, 102)]);
      expect(s.take()).toEqual([{ type: 'tap', x: 103, y: 102, count: 1 }]);
      expect(s.pending()).toBe(0);
    });

    it('lifting with no lifted finger listed is a tap at the landing point', () => {
      const s = pending();
      s.g.end([], []);
      expect(s.take()).toEqual([{ type: 'tap', x: 100, y: 100, count: 1 }]);
    });

    it('a second tap soon after and close by counts two, and a third starts again', () => {
      const s = setup();
      const tap = (x: number) => { s.g.start([f(1, x, 100)]); s.advance(30); s.g.end([], [f(1, x, 100)]); };
      tap(100); s.advance(100); tap(120); s.advance(100); tap(120);
      expect(s.take().map(e => e.type === 'tap' && e.count)).toEqual([1, 2, 1]);
    });

    it('a second tap too far away counts one', () => {
      const s = setup();
      const tap = (x: number) => { s.g.start([f(1, x, 100)]); s.g.end([], [f(1, x, 100)]); };
      tap(100); s.advance(100); tap(140);
      expect(s.take().map(e => e.type === 'tap' && e.count)).toEqual([1, 1]);
    });

    it('a tap, 400 ms, a tap gives two taps of count 1', () => {
      const s = setup();
      const tap = () => { s.g.start([f(1, 100, 100)]); s.g.end([], [f(1, 100, 100)]); };
      tap(); s.advance(400); tap();
      expect(s.take()).toEqual([{ type: 'tap', x: 100, y: 100, count: 1 }, { type: 'tap', x: 100, y: 100, count: 1 }]);
    });

    it('a cancel stops the timer, forgets the chain and emits nothing', () => {
      const s = setup();
      s.g.start([f(1, 100, 100)]); s.g.end([], [f(1, 100, 100)]);
      s.take();
      s.g.start([f(2, 100, 100)]);
      s.g.cancel();
      expect(s.take()).toEqual([]);
      expect(s.pending()).toBe(0);
      s.g.start([f(3, 100, 100)]); s.g.end([], [f(3, 100, 100)]);
      expect(s.take()).toEqual([{ type: 'tap', x: 100, y: 100, count: 1 }]);
    });
  });

  describe('dragging', () => {
    it('a move follows the remembered finger and ignores the others', () => {
      const s = dragging();
      s.g.move([f(2, 500, 500), f(1, 150, 110)]);
      expect(s.take()).toEqual([{ type: 'dragMove', x: 150, y: 110 }]);
      s.g.move([f(2, 520, 500)]);
      expect(s.take()).toEqual([]);
    });

    it('another finger landing does nothing', () => {
      const s = dragging();
      s.g.start([f(1, 130, 100), f(2, 300, 300)]);
      expect(s.take()).toEqual([]);
      s.g.move([f(1, 140, 100), f(2, 300, 300)]);
      expect(s.take()).toEqual([{ type: 'dragMove', x: 140, y: 100 }]);
    });

    it('lifting the remembered finger ends the drag', () => {
      const s = dragging();
      s.g.end([], [f(1, 135, 100)]);
      expect(s.take()).toEqual([{ type: 'dragEnd', x: 135, y: 100, cancelled: false }]);
      s.g.start([f(2, 100, 100)]); s.g.end([], [f(2, 100, 100)]);
      expect(s.take()).toEqual([{ type: 'tap', x: 100, y: 100, count: 1 }]);
    });

    it('lifting the remembered finger while another stays is spent until both lift', () => {
      const s = dragging();
      s.g.start([f(1, 130, 100), f(2, 300, 300)]);
      s.g.end([f(2, 300, 300)], [f(1, 130, 100)]);
      expect(s.take()).toEqual([{ type: 'dragEnd', x: 130, y: 100, cancelled: false }]);
      s.g.move([f(2, 400, 300)]);
      s.g.end([], [f(2, 400, 300)]);
      expect(s.take()).toEqual([]);
      s.g.start([f(3, 100, 100)]); s.g.end([], [f(3, 100, 100)]);
      expect(s.take()).toEqual([{ type: 'tap', x: 100, y: 100, count: 1 }]);
    });

    it('lifting another finger does nothing', () => {
      const s = dragging();
      s.g.start([f(1, 130, 100), f(2, 300, 300)]);
      s.g.end([f(1, 130, 100)], [f(2, 300, 300)]);
      expect(s.take()).toEqual([]);
      s.g.move([f(1, 160, 100)]);
      expect(s.take()).toEqual([{ type: 'dragMove', x: 160, y: 100 }]);
    });

    it('a cancel ends the drag at the last point, cancelled', () => {
      const s = dragging();
      s.g.move([f(1, 150, 120)]);
      s.take();
      s.g.cancel();
      expect(s.take()).toEqual([{ type: 'dragEnd', x: 150, y: 120, cancelled: true }]);
      s.g.start([f(2, 100, 100)]); s.g.end([], [f(2, 100, 100)]);
      expect(s.take()).toEqual([{ type: 'tap', x: 100, y: 100, count: 1 }]);
    });

    it('a drag out and back to the landing point is still a drag', () => {
      const s = pending();
      s.g.move([f(1, 200, 100)]);
      s.g.move([f(1, 100, 100)]);
      s.g.end([], [f(1, 100, 100)]);
      expect(s.take().map(e => e.type)).toEqual(['dragStart', 'dragMove', 'dragMove', 'dragEnd']);
    });

    it('a drag forgets the tap chain', () => {
      const s = setup();
      s.g.start([f(1, 100, 100)]); s.g.end([], [f(1, 100, 100)]);
      s.g.start([f(2, 100, 100)]); s.g.move([f(2, 200, 100)]); s.g.end([], [f(2, 100, 100)]);
      s.take();
      s.g.start([f(3, 100, 100)]); s.g.end([], [f(3, 100, 100)]);
      expect(s.take()).toEqual([{ type: 'tap', x: 100, y: 100, count: 1 }]);
    });
  });

  describe('pinching', () => {
    it('a move reports the centre, the change of gap and how far the centre moved', () => {
      const s = pinching();
      s.g.move([f(1, 50, 120), f(2, 250, 120)]);
      expect(s.take()).toEqual([{ type: 'pinchMove', centerX: 150, centerY: 120, scale: 2, dx: 0, dy: 20 }]);
      s.g.move([f(1, 60, 120), f(2, 160, 120)]);
      expect(s.take()).toEqual([{ type: 'pinchMove', centerX: 110, centerY: 120, scale: 0.5, dx: -40, dy: 0 }]);
    });

    it('a scale of 1 when the last gap was 0', () => {
      const s = setup();
      s.g.start([f(1, 100, 100), f(2, 100, 100)]);
      s.take();
      s.g.move([f(1, 90, 100), f(2, 110, 100)]);
      expect(s.take()).toEqual([{ type: 'pinchMove', centerX: 100, centerY: 100, scale: 1, dx: 0, dy: 0 }]);
    });

    it('one finger lifting ends the pinch and the other finger is spent', () => {
      const s = pinching();
      s.g.end([f(1, 100, 100)], [f(2, 200, 100)]);
      expect(s.take()).toEqual([{ type: 'pinchEnd' }]);
      s.g.move([f(1, 300, 100)]);
      s.g.end([], [f(1, 300, 100)]);
      expect(s.take()).toEqual([]);
    });

    it('both fingers lifting at once ends the pinch and is idle', () => {
      const s = pinching();
      s.g.end([], [f(1, 100, 100), f(2, 200, 100)]);
      expect(s.take()).toEqual([{ type: 'pinchEnd' }]);
      s.g.start([f(3, 100, 100)]); s.g.end([], [f(3, 100, 100)]);
      expect(s.take()).toEqual([{ type: 'tap', x: 100, y: 100, count: 1 }]);
    });

    it('a cancel ends the pinch', () => {
      const s = pinching();
      s.g.cancel();
      expect(s.take()).toEqual([{ type: 'pinchEnd' }]);
      s.g.start([f(3, 100, 100)]); s.g.end([], [f(3, 100, 100)]);
      expect(s.take()).toEqual([{ type: 'tap', x: 100, y: 100, count: 1 }]);
    });
  });

  describe('spent', () => {
    it('lifting the last finger is idle again', () => {
      const s = spent();
      s.g.end([], [f(1, 100, 100)]);
      expect(s.take()).toEqual([]);
      s.g.start([f(2, 100, 100)]); s.g.end([], [f(2, 100, 100)]);
      expect(s.take()).toEqual([{ type: 'tap', x: 100, y: 100, count: 1 }]);
    });

    it('anything else does nothing', () => {
      const s = spent();
      s.g.move([f(1, 300, 300)]);
      s.g.start([f(1, 300, 300), f(2, 400, 400)]);
      s.g.move([f(1, 200, 300), f(2, 500, 400)]);
      s.g.end([f(2, 500, 400)], [f(1, 200, 300)]);
      s.advance(1000);
      expect(s.take()).toEqual([]);
      s.g.end([], [f(2, 500, 400)]);
      expect(s.take()).toEqual([]);
    });
  });
});
