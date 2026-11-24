import { beforeEach, expect, it, vi } from 'vitest';
import { exportAsPNG } from '$lib/utils/export';
import { renderPrintPage } from '$lib/utils/scaledPrint';
import { resolveRooms } from '$lib/utils/roomDetection';
import { roomProject } from './fixtures/project';

/** A canvas that records every fill and stroke colour set, and the stroke colour of every stroke. */
function recordingCanvas() {
  const fills: string[] = [], strokes: string[] = [];
  const state: Record<string, unknown> = { fillStyle: '#000000', strokeStyle: '#000000', font: '10px sans-serif' };
  const methods: Record<string, unknown> = {
    measureText: (text: string) => ({ width: text.length * 6, actualBoundingBoxLeft: 0, actualBoundingBoxRight: 0, actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 0 }),
    stroke: () => { strokes.push(String(state.strokeStyle)); },
  };
  const ctx = new Proxy(methods, {
    get: (target, key) => typeof key === 'string' && key in state ? state[key] : target[key as string] ?? (() => {}),
    set: (_, key, value) => { if (key === 'fillStyle') fills.push(String(value)); state[key as string] = value; return true; },
  });
  const canvas = { width: 400, height: 300, getContext: () => ctx, toDataURL: () => 'data:image/png;base64,test',
    toBlob: (callback: BlobCallback) => callback(new Blob(['png'])) } as unknown as HTMLCanvasElement;
  return { canvas, fills, strokes };
}

let recorder: ReturnType<typeof recordingCanvas>;

beforeEach(() => {
  recorder = recordingCanvas();
  vi.stubGlobal('Image', class { complete = true; naturalWidth = 10; onload: unknown; onerror: unknown; set src(_value: string) {} });
  vi.stubGlobal('document', {
    createElement: (tag: string) => tag === 'canvas' ? recorder.canvas : { click: vi.fn() },
    querySelectorAll: () => [],
    querySelector: () => null,
  });
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:test');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});

/** A walled room coloured #aa5500. */
function colouredRoom() {
  const project = roomProject();
  const floor = project.floors[0];
  floor.rooms = resolveRooms(floor).map(room => ({ ...room, color: '#aa5500' }));
  return project;
}

it('fills a room in the saved picture with its own colour, as the screen does, and paints walls as the screen does', async () => {
  await exportAsPNG(null, colouredRoom());
  expect(recorder.fills).toContain('rgba(170, 85, 0, 0.12)');
  expect(recorder.fills).not.toContain('#bfdbfe');
  expect(recorder.strokes).toContain('#404040');
  expect(recorder.strokes).not.toContain('#333');
});

it('paints walls on the print page as the screen does', () => {
  renderPrintPage(recorder.canvas, colouredRoom(), { pageSize: 'letter', orientation: 'landscape', scale: 'fit' });
  expect(recorder.strokes).toContain('#404040');
});
