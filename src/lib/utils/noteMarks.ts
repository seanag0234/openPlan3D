import type { DetailTarget, Floor, Project, Room } from '$lib/models/types';
import type { CanvasState } from './canvasInteraction';

/** Draw a mark on each thing on the floor that carries a note. */
export function drawNoteMarks(cs: CanvasState, project: Project, floor: Floor, rooms: readonly Room[]): void {}

/** The thing whose note mark is under this screen point, in canvas px. */
export function noteMarkAt(screen: { x: number; y: number }, cs: CanvasState, project: Project, floor: Floor, rooms: readonly Room[]): DetailTarget | null { return null; }
