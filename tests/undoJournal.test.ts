import './fixtures/indexeddb';
import { describe, expect, it, vi } from 'vitest';
import { createSharedStrings } from '$lib/stores/packState';
import { buildJournal, deleteUndoJournal, journalFor, JOURNAL_STEPS, readUndoJournal, writeUndoJournal } from '$lib/services/undoJournal';

const shared = createSharedStrings();
const picture = 'P'.repeat(6000);
const step = (n: number) => ({ state: shared.pack({ n, picture }), description: `Step ${n}`, timestamp: 1000 + n });
const steps = (count: number, from = 0) => Array.from({ length: count }, (_, i) => step(from + i));
const base = (over: Partial<Parameters<typeof buildJournal>[0]> = {}) => ({
  planUpdatedAt: '2026-01-02T03:04:05.000Z',
  current: shared.pack({ n: 'now', picture }),
  undo: steps(12),
  redo: [] as ReturnType<typeof step>[],
  tokens: shared.tokens,
  text: shared.text,
  now: 5000,
  ...over,
});

describe('buildJournal', () => {
  it('keeps the newest ten of twelve steps and the strings they name', () => {
    const journal = buildJournal(base())!;
    expect(JOURNAL_STEPS).toBe(10);
    expect(journal.undo.map(e => e.description)).toEqual(steps(10, 2).map(e => e.description));
    expect(journal.v).toBe(1);
    expect(journal.writtenAt).toBe(5000);
    expect(Object.values(journal.shared)).toEqual([picture]);
  });

  it('drops the oldest steps to fit the size limit', () => {
    const undo = [{ state: 'u'.repeat(300), description: 'Old', timestamp: 1 }, { state: 'v'.repeat(300), description: 'New', timestamp: 2 }];
    const redo = [{ state: 'r'.repeat(300), description: 'Redo old', timestamp: 3 }, { state: 's'.repeat(300), description: 'Redo new', timestamp: 4 }];
    const small = { current: 'c'.repeat(100), undo, redo, tokens: () => [], text: () => undefined };
    const fitsAll = buildJournal(base(small), 1300)!;
    expect(fitsAll.undo).toHaveLength(2);
    const fitted = buildJournal(base(small), 1000)!;
    expect(fitted.undo.map(e => e.description)).toEqual(['New']);
    expect(fitted.redo.map(e => e.description)).toEqual(['Redo old', 'Redo new']);
    const tighter = buildJournal(base(small), 700)!;
    expect(tighter.undo.map(e => e.description)).toEqual(['New']);
    expect(tighter.redo.map(e => e.description)).toEqual(['Redo new']);
    expect(buildJournal(base(small), 300)).toBeNull();
  });

  it('writes nothing for an empty history or a string it cannot find', () => {
    expect(buildJournal(base({ undo: [], redo: [] }))).toBeNull();
    expect(buildJournal(base({ text: () => undefined }))).toBeNull();
  });

  it('writes the plan alone for an empty history when asked to', () => {
    const journal = buildJournal(base({ undo: [], redo: [], keepEmpty: true }))!;
    expect(journal.undo).toEqual([]);
    expect(journal.redo).toEqual([]);
    expect(Object.values(journal.shared)).toEqual([picture]);
    const later = journalFor(journal, '2026-01-02T03:04:06.000Z')!;
    expect(later.undo).toEqual([{ state: journal.current, description: 'Edit', timestamp: 5000 }]);
  });
});

describe('journalFor', () => {
  const journal = () => buildJournal(base({ undo: steps(3), redo: steps(2, 7) }))!;

  it('gives both stacks back for the plan it was written for', () => {
    const found = journalFor(JSON.parse(JSON.stringify(journal())), '2026-01-02T03:04:05.000Z')!;
    expect(found.undo.map(e => e.description)).toEqual(['Step 0', 'Step 1', 'Step 2']);
    expect(found.redo.map(e => e.description)).toEqual(['Step 7', 'Step 8']);
    expect(Object.values(found.shared)).toEqual([picture]);
  });

  it('adds the plan it was written for as one more step when the plan was saved again since', () => {
    const written = journal();
    const found = journalFor(written, '2026-01-02T03:04:06.000Z')!;
    expect(found.undo).toHaveLength(4);
    expect(found.undo[3]).toEqual({ state: written.current, description: 'Edit', timestamp: 5000 });
    expect(found.redo).toEqual([]);
    const full = buildJournal(base({ undo: steps(10) }))!;
    const capped = journalFor(full, '2026-02-01T00:00:00.000Z')!;
    expect(capped.undo).toHaveLength(JOURNAL_STEPS);
    expect(capped.undo[0].description).toBe('Step 1');
  });

  it('gives nothing for a journal newer than the plan or one that is not a journal', () => {
    expect(journalFor(journal(), '2026-01-02T03:04:04.000Z')).toBeNull();
    expect(journalFor(null, '2026-01-02T03:04:05.000Z')).toBeNull();
    expect(journalFor('garbage', '2026-01-02T03:04:05.000Z')).toBeNull();
    expect(journalFor({ ...journal(), v: 2 }, '2026-01-02T03:04:05.000Z')).toBeNull();
    expect(journalFor({ ...journal(), undo: [{ description: 'No state' }] }, '2026-01-02T03:04:05.000Z')).toBeNull();
    expect(journalFor({ ...journal(), shared: { t: 5 } }, '2026-01-02T03:04:05.000Z')).toBeNull();
  });
});

describe('journal storage', () => {
  it('writes, reads and deletes a journal by plan', async () => {
    const written = buildJournal(base())!;
    expect(await readUndoJournal('plan-1')).toBeNull();
    await writeUndoJournal('plan-1', written);
    expect(await readUndoJournal('plan-1')).toEqual(written);
    expect(await readUndoJournal('plan-2')).toBeNull();
    await writeUndoJournal('plan-1', null);
    expect(await readUndoJournal('plan-1')).toBeNull();
    await writeUndoJournal('plan-1', written);
    await deleteUndoJournal('plan-1');
    expect(await readUndoJournal('plan-1')).toBeNull();
  });

  it('reads nothing and writes nothing without IndexedDB', async () => {
    vi.stubGlobal('indexedDB', undefined);
    await expect(writeUndoJournal('plan-1', buildJournal(base()))).resolves.toBeUndefined();
    await expect(readUndoJournal('plan-1')).resolves.toBeNull();
    await expect(deleteUndoJournal('plan-1')).resolves.toBeUndefined();
  });
});
