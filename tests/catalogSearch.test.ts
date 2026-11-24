import { describe, expect, it } from 'vitest';
import { catalogAliases, matchesCatalogSearch } from '../src/lib/utils/catalogSearch';
import { furnitureCatalog } from '../src/lib/utils/furnitureCatalog';
import { entourageCatalog } from '../src/lib/utils/entourageCatalog';

const sofa = ['Sofa', 'Living Room'];

describe('matchesCatalogSearch', () => {
  it('finds a thing by a word people call it', () => {
    expect(matchesCatalogSearch('couch', 'sofa', sofa)).toBe(true);
    expect(matchesCatalogSearch('COUCHES', 'sofa', sofa)).toBe(true);
  });

  it('ignores accents and case', () => {
    expect(matchesCatalogSearch('sofá', 'sofa', sofa)).toBe(true);
  });

  it('lets each word match a different name', () => {
    expect(matchesCatalogSearch('living sofa', 'sofa', sofa)).toBe(true);
    expect(matchesCatalogSearch('living bed', 'sofa', sofa)).toBe(false);
  });

  it('needs every word to match', () => {
    expect(matchesCatalogSearch('power outlet', 'sym_outlet', ['Power Outlet', 'Electrical'])).toBe(true);
    expect(matchesCatalogSearch('power outlet', 'stove', ['Stove', 'Kitchen'])).toBe(false);
  });

  it('matches nothing for a word nothing has', () => {
    expect(matchesCatalogSearch('{number}', 'sofa', sofa)).toBe(false);
    expect(matchesCatalogSearch('{number}', 'sym_outlet', ['Power Outlet', 'Electrical'])).toBe(false);
  });

  it('matches everything for an empty or blank query', () => {
    expect(matchesCatalogSearch('', 'sofa', sofa)).toBe(true);
    expect(matchesCatalogSearch('   ', 'stove', ['Stove'])).toBe(true);
  });

  it('skips missing names', () => {
    expect(matchesCatalogSearch('stove', 'stove', [undefined, 'Stove'])).toBe(true);
  });

  it('only names things the catalogs have', () => {
    const ids = new Set([...furnitureCatalog, ...entourageCatalog].map(item => item.id));
    expect(Object.keys(catalogAliases).filter(id => !ids.has(id))).toEqual([]);
  });
});
