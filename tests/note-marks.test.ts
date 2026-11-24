import { describe, expect, it } from 'vitest';
import { drawNoteMarks, noteMarkAt } from '$lib/utils/noteMarks';
import type { CanvasState } from '$lib/utils/canvasInteraction';
import { roomProject } from './fixtures/project';

describe('note marks, as the editor does today', () => {
  it('draws nothing and finds no mark anywhere', () => {
    const project = roomProject(), floor = project.floors[0];
    const calls: string[] = [];
    const ctx = new Proxy({}, { get: (_, key) => () => { calls.push(String(key)); } }) as unknown as CanvasRenderingContext2D;
    const cs: CanvasState = { ctx, width: 800, height: 600, zoom: 1, camX: 0, camY: 0 };
    drawNoteMarks(cs, project, floor, floor.rooms);
    expect(calls).toEqual([]);
    for (const screen of [{ x: 0, y: 0 }, { x: 400, y: 300 }, { x: -50, y: 9000 }]) {
      expect(noteMarkAt(screen, cs, project, floor, floor.rooms)).toBeNull();
    }
  });
});
