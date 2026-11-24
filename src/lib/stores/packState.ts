/**
 * History states as JSON text in which every long string (a floor's background picture, a photo) is kept once,
 * in a table shared by all states, and stands in the text as a short token. Fifty Undo steps of a plan with a
 * 1 MB picture then hold the picture once instead of fifty times.
 */

export const SHARED_STRING_MIN = 4096;

export interface SharedStrings {
  /** JSON text; every string of SHARED_STRING_MIN characters or more replaced by a token. */
  pack(value: unknown): string;
  /** JSON.parse, each known token replaced by its string. */
  unpack(state: string): any;
  /** The tokens a packed text refers to. */
  tokens(state: string): string[];
  text(token: string): string | undefined;
  /** A string kept elsewhere, under the token it had. */
  add(token: string, text: string): void;
  /** Forget every string none of these packed texts refers to. */
  retain(states: Iterable<string>): void;
  /** 2 x the characters held. */
  bytes(): number;
  clear(): void;
}

const TOKEN_PREFIX = '\u0001o3d:';
// In JSON text the first character of a token appears as the six characters \u0001. A token is always a whole
// string value, so it starts right after an opening quote; a backslash a user typed would read \\u0001.
const TOKEN_IN_TEXT = /"\\u0001o3d:(\d+:[0-9a-f]+(?::\d+)?)"/g;

function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16);
}

export function createSharedStrings(): SharedStrings {
  const tokenOf = new Map<string, string>();
  const textOf = new Map<string, string>();
  let chars = 0;

  const remember = (token: string, text: string) => {
    textOf.set(token, text);
    tokenOf.set(text, token);
    chars += text.length;
  };

  const intern = (text: string): string => {
    const known = tokenOf.get(text);
    if (known !== undefined) return known;
    const base = TOKEN_PREFIX + text.length + ':' + fnv1a(text);
    let token = base;
    for (let n = 2; textOf.has(token) && textOf.get(token) !== text; n++) token = `${base}:${n}`;
    if (textOf.has(token)) tokenOf.set(text, token);
    else remember(token, text);
    return token;
  };

  const replacer = (_key: string, value: unknown) =>
    typeof value === 'string' && value.length >= SHARED_STRING_MIN ? intern(value) : value;
  const reviver = (_key: string, value: unknown) => {
    if (typeof value !== 'string' || !value.startsWith(TOKEN_PREFIX)) return value;
    const text = textOf.get(value);
    return text === undefined ? value : text;
  };

  const tokens = (state: string): string[] => {
    const found = new Set<string>();
    for (const match of state.matchAll(TOKEN_IN_TEXT)) found.add(TOKEN_PREFIX + match[1]);
    return [...found];
  };

  return {
    pack: (value) => JSON.stringify(value, replacer),
    unpack: (state) => JSON.parse(state, reviver),
    tokens,
    text: (token) => textOf.get(token),
    add(token, text) {
      const held = textOf.get(token);
      if (held === text) return;
      if (held !== undefined) {
        tokenOf.delete(held);
        chars -= held.length;
      }
      textOf.set(token, text);
      if (!tokenOf.has(text)) tokenOf.set(text, token);
      chars += text.length;
    },
    retain(states) {
      const used = new Set<string>();
      for (const state of states) for (const token of tokens(state)) used.add(token);
      for (const [token, text] of textOf) {
        if (used.has(token)) continue;
        textOf.delete(token);
        if (tokenOf.get(text) === token) tokenOf.delete(text);
        chars -= text.length;
      }
    },
    bytes: () => chars * 2,
    clear() {
      tokenOf.clear();
      textOf.clear();
      chars = 0;
    },
  };
}
