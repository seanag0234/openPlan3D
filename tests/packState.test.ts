import { describe, expect, it } from 'vitest';
import { createSharedStrings, SHARED_STRING_MIN } from '$lib/stores/packState';

const long = (length: number, fill = 'a') => fill.repeat(length);

describe('shared strings for history states', () => {
  it('gives back an equal object after a round trip', () => {
    const shared = createSharedStrings();
    const value = { name: 'Plan', floors: [{ picture: long(9000, 'p'), walls: [1, 2, 3] }], note: 'short', empty: '' };
    expect(shared.unpack(shared.pack(value))).toEqual(value);
  });

  it('keeps a string shorter than the limit in the text and moves one at the limit out', () => {
    const shared = createSharedStrings();
    expect(SHARED_STRING_MIN).toBe(4096);
    const short = long(4095, 's'), longer = long(4096, 'l');
    expect(shared.pack({ v: short })).toContain(short);
    const packed = shared.pack({ v: longer });
    expect(packed).not.toContain(longer);
    expect(shared.tokens(packed)).toHaveLength(1);
    expect(shared.unpack(packed).v).toBe(longer);
  });

  it('holds a string two objects share once', () => {
    const shared = createSharedStrings();
    const picture = long(10_000, 'x');
    shared.pack({ a: picture });
    shared.pack({ b: picture, c: 1 });
    expect(shared.bytes()).toBe(20_000);
  });

  it('packs equal objects to equal text', () => {
    const shared = createSharedStrings();
    const make = () => ({ a: long(5000, 'q'), b: [long(6000, 'r')], c: 'small' });
    expect(shared.pack(make())).toBe(shared.pack(make()));
  });

  it('forgets every string when nothing refers to it', () => {
    const shared = createSharedStrings();
    const keep = shared.pack({ a: long(5000, 'k') });
    shared.pack({ b: long(7000, 'd') });
    expect(shared.bytes()).toBe(24_000);
    shared.retain([keep]);
    expect(shared.bytes()).toBe(10_000);
    shared.retain([]);
    expect(shared.bytes()).toBe(0);
  });

  it('gives back a string added under its token', () => {
    const source = createSharedStrings();
    const text = long(8000, 'z');
    const packed = source.pack({ text });
    const [token] = source.tokens(packed);
    const target = createSharedStrings();
    target.add(token, source.text(token)!);
    expect(target.unpack(packed)).toEqual({ text });
  });

  it('keeps two different strings that land on one token apart', () => {
    const shared = createSharedStrings();
    const a = long(5000, 'm'), b = long(5000, 'n');
    const packedA = shared.pack({ a });
    const [token] = shared.tokens(packedA);
    // Claim the token b would need for a different string: b must take a numbered one.
    const other = createSharedStrings();
    const [tokenB] = other.tokens(other.pack({ b }));
    shared.add(tokenB, a + 'x');
    const packedB = shared.pack({ b });
    expect(shared.tokens(packedB)[0]).toBe(tokenB + ':2');
    expect(shared.unpack(packedB)).toEqual({ b });
    expect(shared.unpack(packedA)).toEqual({ a });
    expect(token).not.toBe(tokenB);
  });

  it('leaves a token-like string the table does not hold as it is', () => {
    const shared = createSharedStrings();
    const value = { v: '\u0001o3d:5:deadbeef' };
    expect(shared.unpack(JSON.stringify(value))).toEqual(value);
  });
});
