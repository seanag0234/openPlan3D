import { describe, expect, it } from 'vitest';
import { customSymbolName } from '$lib/utils/symbolName';

const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('the name of a picture added to the plan', () => {
  const plan = { customEntourage: [{ id: 'pic', name: ' Meadow ', dataUrl: pixel, aspect: 1 }, { id: 'blank', name: '   ', dataUrl: pixel, aspect: 1 }] };
  it('is the name it was given, without spaces around it', () => {
    expect(customSymbolName('pic', plan)).toBe('Meadow');
  });
  it('is empty for an id the plan does not know, a name of spaces only and no plan', () => {
    expect(customSymbolName('unknown', plan)).toBe('');
    expect(customSymbolName('blank', plan)).toBe('');
    expect(customSymbolName('pic', null)).toBe('');
    expect(customSymbolName('pic', undefined)).toBe('');
    expect(customSymbolName('pic', {})).toBe('');
  });
});
