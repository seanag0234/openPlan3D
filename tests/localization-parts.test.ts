import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { sharedEn } from '../src/lib/i18n/locales/parts/shared.en';
import { sharedPt } from '../src/lib/i18n/locales/parts/shared.pt';
import { touchEn } from '../src/lib/i18n/locales/parts/touch.en';
import { touchPt } from '../src/lib/i18n/locales/parts/touch.pt';
import { panelsEn } from '../src/lib/i18n/locales/parts/panels.en';
import { panelsPt } from '../src/lib/i18n/locales/parts/panels.pt';
import { barsEn } from '../src/lib/i18n/locales/parts/bars.en';
import { barsPt } from '../src/lib/i18n/locales/parts/bars.pt';
import { savingEn } from '../src/lib/i18n/locales/parts/saving.en';
import { savingPt } from '../src/lib/i18n/locales/parts/saving.pt';
import { homeEn } from '../src/lib/i18n/locales/parts/home.en';
import { homePt } from '../src/lib/i18n/locales/parts/home.pt';
import { addingEn } from '../src/lib/i18n/locales/parts/adding.en';
import { addingPt } from '../src/lib/i18n/locales/parts/adding.pt';
import { drawingEn } from '../src/lib/i18n/locales/parts/drawing.en';
import { drawingPt } from '../src/lib/i18n/locales/parts/drawing.pt';
import { wordsEn } from '../src/lib/i18n/locales/parts/words.en';
import { wordsPt } from '../src/lib/i18n/locales/parts/words.pt';

const parts: Record<string, { en: object; pt: object }> = {
  shared: { en: sharedEn, pt: sharedPt },
  touch: { en: touchEn, pt: touchPt },
  panels: { en: panelsEn, pt: panelsPt },
  bars: { en: barsEn, pt: barsPt },
  saving: { en: savingEn, pt: savingPt },
  home: { en: homeEn, pt: homePt },
  adding: { en: addingEn, pt: addingPt },
  drawing: { en: drawingEn, pt: drawingPt },
  words: { en: wordsEn, pt: wordsPt },
};
const read = (file: string) => readFileSync(new URL(`../src/lib/i18n/locales/${file}`, import.meta.url), 'utf8');

describe('translation parts', () => {
  it('give every area the same keys in English and Portuguese', () => {
    for (const [area, { en, pt }] of Object.entries(parts)) {
      expect(Object.keys(pt).sort(), area).toEqual(Object.keys(en).sort());
    }
  });

  it('keep each key in one part only', () => {
    for (const language of ['en', 'pt'] as const) {
      const owner = new Map<string, string>();
      for (const [area, part] of Object.entries(parts)) {
        for (const key of Object.keys(part[language])) {
          expect(owner.get(key), `${language} ${key} is in ${owner.get(key)} and ${area}`).toBeUndefined();
          owner.set(key, area);
        }
      }
    }
  });

  it('keep part keys out of the main dictionaries', () => {
    const main = { en: read('en.ts'), pt: read('pt.ts') };
    for (const [area, part] of Object.entries(parts)) {
      for (const language of ['en', 'pt'] as const) {
        for (const key of Object.keys(part[language])) {
          expect(main.en.includes(`"${key}":`), `${area} ${key} in en.ts`).toBe(false);
          expect(main.pt.includes(`"${key}":`), `${area} ${key} in pt.ts`).toBe(false);
        }
      }
    }
  });
});
