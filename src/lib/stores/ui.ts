import { writable } from 'svelte/store';
import type { DetailTarget } from '$lib/models/types';

/** The item details sheet is open. */
export const detailsOpen = writable(false);
/** The build panel is folded away. */
export const buildPanelFolded = writable(false);
/** Whose note the note sheet shows: an item, the whole plan, or nobody. */
export const noteTarget = writable<DetailTarget | 'plan' | null>(null);
/** The list of every note is open. */
export const notesListOpen = writable(false);
/** The feedback sheet is open. */
export const feedbackOpen = writable(false);
/** Presses add to the selection instead of replacing it. */
export const multiSelectMode = writable(false);
/** How many CSS px of the plan's right and bottom edges an open sheet covers. */
export const planObstruction = writable<{ right: number; bottom: number }>({ right: 0, bottom: 0 });
/** Bump to ask the plan to bring the selection into view. */
export const revealSelection = writable(0);
