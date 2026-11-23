import { expect, it } from 'vitest';
import { furnitureCatalog, getCatalogItem } from '../src/lib/utils/furnitureCatalog';
import { customModelName, furnitureName, portugueseFurnitureNames } from '../src/lib/i18n/furnitureNames';
import { undoMessage } from '../src/lib/i18n/undoMessages';

it('covers every built-in and import-preview ID without changing catalog data', () => {
  const before = JSON.stringify(furnitureCatalog);
  const ids = [...furnitureCatalog.map(item => item.id), 'imported_object', 'stairs'];
  expect(Object.keys(portugueseFurnitureNames).sort()).toEqual(ids.sort());
  for (const id of ids) {
    expect(furnitureName(id, 'en')).toBe(getCatalogItem(id)!.name);
    expect(furnitureName(id, 'pt').trim()).not.toBe('');
  }
  expect(furnitureName('sink_k', 'pt')).toBe('Pia de cozinha');
  expect(furnitureName('sink_b', 'pt')).toBe('Pia de banheiro');
  expect(undoMessage('Added sofa', 'pt')).toBe('Item adicionado: Sofá');
  expect(undoMessage('Added sofa', 'en')).toBe('Added sofa');
  expect(furnitureName('custom {private}', 'pt')).toBe('custom {private}');
  expect(undoMessage('Added custom {private}', 'pt')).toBe('Added custom {private}');
  expect(JSON.stringify(furnitureCatalog)).toBe(before);
});

it('captions a piece with its own trimmed name first, then its custom model name', () => {
  const project: any = { customModels: [{ id: 'model', name: 'Scanned chair' }] };
  const piece: any = { id: 'p', catalogId: 'imported_object', position: { x: 0, y: 0 }, rotation: 0, scale: { x: 1, y: 1, z: 1 } };
  expect(customModelName({ ...piece, name: '  Reading nook  ', customModelId: 'model' }, project)).toBe('Reading nook');
  expect(customModelName({ ...piece, name: '   ', customModelId: 'model' }, project)).toBe('Scanned chair');
  expect(customModelName({ ...piece, name: 'Lego table' })).toBe('Lego table');
  expect(customModelName(piece, project)).toBeUndefined();
});
