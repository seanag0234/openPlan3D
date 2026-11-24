import { describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { buildPanelFolded, detailsOpen, feedbackOpen, importQuestion, multiSelectMode, noteTarget, notesListOpen, planObstruction, revealSelection } from '$lib/stores/ui';

describe('editor sheet stores', () => {
  it('start with every sheet closed and nothing covering the plan', () => {
    expect(get(detailsOpen)).toBe(false);
    expect(get(buildPanelFolded)).toBe(false);
    expect(get(noteTarget)).toBeNull();
    expect(get(notesListOpen)).toBe(false);
    expect(get(feedbackOpen)).toBe(false);
    expect(get(multiSelectMode)).toBe(false);
    expect(get(planObstruction)).toEqual({ right: 0, bottom: 0 });
    expect(get(revealSelection)).toBe(0);
    expect(get(importQuestion)).toBeNull();
  });
});
