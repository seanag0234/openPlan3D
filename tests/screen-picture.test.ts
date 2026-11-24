import { beforeEach, expect, it, vi } from 'vitest';
import { exportScreenPNG } from '$lib/utils/export';

let anchors: { href: string; download: string; click: () => void }[];
let downloaded: Blob[];

beforeEach(() => {
  anchors = []; downloaded = [];
  vi.stubGlobal('document', {
    createElement: () => { const a = { href: '', download: '', click: vi.fn() }; anchors.push(a); return a; },
    querySelectorAll: () => [], querySelector: () => null,
  });
  vi.spyOn(URL, 'createObjectURL').mockImplementation(blob => { downloaded.push(blob as Blob); return 'blob:screen'; });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});

/** A plan canvas whose picture is the bytes "screen". */
const screen = { toBlob: (callback: BlobCallback, type?: string) => callback(new Blob(['screen'], { type })) } as unknown as HTMLCanvasElement;

it('saves the plan canvas as it is on screen, as one PNG named after the plan', async () => {
  expect(await exportScreenPNG(screen, 'Room with boxes')).toBe(true);
  expect(anchors).toHaveLength(1);
  expect(anchors[0].download).toBe('Room with boxes.png');
  expect(anchors[0].click).toHaveBeenCalledOnce();
  expect(downloaded).toHaveLength(1);
  expect(await downloaded[0].text()).toBe('screen');
  expect(downloaded[0].type).toBe('image/png');
});

it('names the picture floorplan.png when no name is given', async () => {
  await exportScreenPNG(screen);
  expect(anchors.map(a => a.download)).toEqual(['floorplan.png']);
});
