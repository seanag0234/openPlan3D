import { get } from 'svelte/store';
import type { DetailTarget, Floor, Project, Room } from '$lib/models/types';
import type { CanvasState } from './canvasInteraction';
import { selectedElementId } from '$lib/stores/project';
import { getFurnitureSize } from './furnitureCatalog';
import { itemDetails } from './itemDetails';

/** A note's mark on the plan: its centre, in the canvas's screen px. */
export interface NoteMark { target: DetailTarget; x: number; y: number }

const RADIUS = 9;

function toScreen(cs: CanvasState, x: number, y: number) {
  return { x: (x - cs.camX) * cs.zoom + cs.width / 2, y: (y - cs.camY) * cs.zoom + cs.height / 2 };
}

/** Every thing on the floor that carries a note, but the one `skipId` names, with where its mark goes. */
export function noteMarkList(cs: CanvasState, project: Project, floor: Floor, rooms: readonly Room[], skipId: string | null): NoteMark[] {
  const marks: NoteMark[] = [];
  const noted = (target: DetailTarget) => target.id !== skipId && !!itemDetails(project, target).note?.trim();
  for (const piece of floor.furniture ?? []) {
    const target: DetailTarget = { floorId: floor.id, kind: 'furniture', id: piece.id };
    if (!noted(target)) continue;
    const { width, depth } = getFurnitureSize(piece);
    const angle = (piece.rotation * Math.PI) / 180, cos = Math.cos(angle), sin = Math.sin(angle);
    const cx = width / 2, cy = -depth / 2;
    const corner = toScreen(cs, piece.position.x + cx * cos - cy * sin, piece.position.y + cx * sin + cy * cos);
    marks.push({ target, x: corner.x + 6, y: corner.y - 6 });
  }
  for (const wall of floor.walls ?? []) {
    const target: DetailTarget = { floorId: floor.id, kind: 'walls', id: wall.id };
    if (!noted(target)) continue;
    const mid = toScreen(cs, (wall.start.x + wall.end.x) / 2, (wall.start.y + wall.end.y) / 2);
    const dx = wall.end.x - wall.start.x, dy = wall.end.y - wall.start.y, length = Math.hypot(dx, dy) || 1;
    marks.push({ target, x: mid.x + (dy / length) * 10, y: mid.y - (dx / length) * 10 });
  }
  for (const room of rooms) {
    const target: DetailTarget = { floorId: floor.id, kind: 'rooms', id: room.id };
    const corners = room.walls.map(id => floor.walls.find(wall => wall.id === id)?.start).filter(point => !!point);
    if (!corners.length || !noted(target)) continue;
    const centre = toScreen(cs, corners.reduce((sum, p) => sum + p.x, 0) / corners.length, corners.reduce((sum, p) => sum + p.y, 0) / corners.length);
    marks.push({ target, x: centre.x, y: centre.y - 16 });
  }
  return marks;
}

/** Draw a mark on each thing on the floor that carries a note. Draws no text: specs find things by the text on the plan. */
export function drawNoteMarks(cs: CanvasState, project: Project, floor: Floor, rooms: readonly Room[]): void {
  const marks = noteMarkList(cs, project, floor, rooms, get(selectedElementId));
  if (!marks.length) return;
  const { ctx } = cs;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (const { x, y } of marks) {
    ctx.beginPath();
    ctx.arc(x, y, RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = '#fbbf24';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#92400e';
    ctx.stroke();
    ctx.beginPath();
    for (const dy of [-3, 0, 3]) { ctx.moveTo(x - 4, y + dy); ctx.lineTo(x + (dy === 3 ? 1 : 4), y + dy); }
    ctx.lineWidth = 1.25;
    ctx.strokeStyle = '#451a03';
    ctx.stroke();
  }
  ctx.restore();
}

/** The thing whose note mark is under this screen point, in canvas px. */
export function noteMarkAt(screen: { x: number; y: number }, cs: CanvasState, project: Project, floor: Floor, rooms: readonly Room[]): DetailTarget | null {
  const reach = cs.coarse ? 22 : 14;
  let best: NoteMark | null = null, bestDistance = reach;
  for (const mark of noteMarkList(cs, project, floor, rooms, get(selectedElementId))) {
    const distance = Math.hypot(mark.x - screen.x, mark.y - screen.y);
    if (distance <= bestDistance) { best = mark; bestDistance = distance; }
  }
  return best?.target ?? null;
}

/** What a note is about, as the note sheet and the list of notes name it. */
export function noteTitle(project: Project, target: DetailTarget | 'plan', rooms: readonly Room[], words: {
  plan: string; wall: string; room: string; piece: (catalogId: string) => string }): string {
  if (target === 'plan') return words.plan;
  const floor = project.floors.find(f => f.id === target.floorId);
  if (target.kind === 'furniture') {
    const piece = floor?.furniture.find(item => item.id === target.id);
    return piece?.name?.trim() || (piece ? words.piece(piece.catalogId) : words.room);
  }
  if (target.kind === 'walls') return words.wall;
  if (target.kind === 'rooms') return (rooms.find(r => r.id === target.id) ?? floor?.rooms.find(r => r.id === target.id))?.name || words.room;
  return words.wall;
}
