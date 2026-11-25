import type Anthropic from '@anthropic-ai/sdk';
import type { FurnitureItem, Project } from '$lib/models/types';
import { AgentOpError, type AgentOp } from './agentOps';
import { getCatalogItem, getFurnitureSize } from './furnitureCatalog';

/** Claude works in feet, as she does; the plan stores centimetres. */
const CM_PER_FT = 30.48;
const ft = (cm: number) => Math.round((cm / CM_PER_FT) * 10) / 10;
const cm = (feet: number) => feet * CM_PER_FT;

function activeFloor(project: Project): any {
  return (project.floors as any[]).find(f => f.id === project.activeFloorId) ?? project.floors[0];
}

const pieceName = (item: FurnitureItem) => item.name ?? getCatalogItem(item.catalogId)?.name ?? item.catalogId;

/** What Claude reads: the house's outline and every piece on the open floor, in feet, x right and y down. */
export function planForClaude(project: Project) {
  const floor = activeFloor(project);
  const xs = (floor.walls ?? []).flatMap((w: any) => [w.start.x, w.end.x]);
  const ys = (floor.walls ?? []).flatMap((w: any) => [w.start.y, w.end.y]);
  return {
    units: 'feet; x grows to the right, y grows downward; a piece is placed by its centre; rotation in degrees clockwise',
    house: xs.length ? { left: ft(Math.min(...xs)), top: ft(Math.min(...ys)), right: ft(Math.max(...xs)), bottom: ft(Math.max(...ys)) } : null,
    rooms: (floor.rooms ?? []).map((r: any) => r.name).filter(Boolean),
    pieces: (floor.furniture ?? []).map((item: FurnitureItem) => {
      const size = getFurnitureSize(item);
      return {
        id: item.id, name: pieceName(item), x: ft(item.position.x), y: ft(item.position.y),
        width: ft(size.width), depth: ft(size.depth), height: ft(size.height), rotation: item.rotation || 0,
        ...(item.locked ? { locked: true } : {}),
      };
    }),
  };
}

export interface PieceChange {
  id?: string; remove?: boolean; name?: string;
  x?: number; y?: number; width?: number; depth?: number; height?: number; rotation?: number;
}

const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v);

/**
 * Claude's changes as checked edits. A change with an id changes or removes that piece; one without adds a plain
 * box. Locked pieces (the house's play areas and colour patches) are hers to unlock, never Claude's to move.
 */
export function changesToOps(project: Project, changes: PieceChange[]): AgentOp[] {
  if (!Array.isArray(changes) || !changes.length) throw new AgentOpError('Give at least one change.');
  const floor = activeFloor(project);
  const pieces = new Map<string, FurnitureItem>((floor.furniture ?? []).map((f: FurnitureItem) => [f.id, f]));
  return changes.map((change, i): AgentOp => {
    const where = `change ${i + 1}`;
    for (const key of ['x', 'y', 'width', 'depth', 'height', 'rotation'] as const) {
      if (change[key] !== undefined && !finite(change[key])) throw new AgentOpError(`${where}: ${key} must be a number of feet.`);
    }
    for (const key of ['width', 'depth', 'height'] as const) {
      if (change[key] !== undefined && !(change[key]! > 0)) throw new AgentOpError(`${where}: ${key} must be more than 0 ft.`);
    }
    if (change.id === undefined) {
      if (change.remove) throw new AgentOpError(`${where}: say which piece to remove by its id.`);
      if (!finite(change.x) || !finite(change.y)) throw new AgentOpError(`${where}: a new box needs x and y.`);
      return { op: 'add', floorId: floor.id, collection: 'furniture', item: {
        id: `piece-${crypto.randomUUID()}`, catalogId: 'imported_object', name: (change.name ?? 'Box').slice(0, 60),
        position: { x: cm(change.x!), y: cm(change.y!) }, rotation: change.rotation ?? 0, scale: { x: 1, y: 1, z: 1 },
        width: cm(change.width ?? 3), depth: cm(change.depth ?? 3), height: cm(change.height ?? 3),
      } };
    }
    const piece = pieces.get(change.id);
    if (!piece) throw new AgentOpError(`${where}: no piece with id "${change.id}" on this floor.`);
    if (piece.locked) throw new AgentOpError(`${where}: "${pieceName(piece)}" is locked; the person has to unlock it first.`);
    if (change.remove) return { op: 'remove', id: piece.id };
    const set: Record<string, unknown> = {};
    if (change.x !== undefined || change.y !== undefined) {
      set.position = { x: change.x !== undefined ? cm(change.x) : piece.position.x, y: change.y !== undefined ? cm(change.y) : piece.position.y };
    }
    // A typed size replaces the piece's scale, as Details does.
    for (const key of ['width', 'depth', 'height'] as const) if (change[key] !== undefined) set[key] = cm(change[key]!);
    if (set.width !== undefined || set.depth !== undefined || set.height !== undefined) set.scale = { x: 1, y: 1, z: 1 };
    if (change.rotation !== undefined) set.rotation = ((change.rotation % 360) + 360) % 360;
    if (change.name !== undefined) set.name = change.name.slice(0, 60);
    if (!Object.keys(set).length) throw new AgentOpError(`${where}: nothing to change.`);
    return { op: 'update', id: piece.id, set };
  });
}

/** The two tools, in a fixed order so the request prefix stays cacheable. */
export const CLAUDE_TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: 'read_plan',
    description: 'Read the open plan: the house outline and every piece with its id, name, centre (x, y), size and rotation, in feet. Read it again after a change; the person may also have moved things themselves.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'change_plan',
    description: 'Propose changes to pieces. The person sees "summary" and taps Do it or No; nothing changes until they agree, and all the changes land together as one Undo step. A change with "id" moves, resizes, turns, renames or (remove: true) removes that piece; one without "id" adds a plain box. Locked pieces cannot be changed.',
    input_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'One short sentence in her words, saying what will change, e.g. "Move the vet next to the school."' },
        changes: {
          type: 'array', minItems: 1,
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'The piece to change; leave out to add a new box.' },
              remove: { type: 'boolean' },
              name: { type: 'string' },
              x: { type: 'number', description: 'New centre, feet from the left.' },
              y: { type: 'number', description: 'New centre, feet from the top.' },
              width: { type: 'number' }, depth: { type: 'number' }, height: { type: 'number' },
              rotation: { type: 'number', description: 'Degrees clockwise.' },
            },
            additionalProperties: false,
          },
        },
      },
      required: ['summary', 'changes'],
      additionalProperties: false,
    },
  },
];

export const CLAUDE_SYSTEM = `You help a parent lay out a room in a floor-plan editor, usually on an iPad: here, a pretend town for the kids in a basement.
They think in feet, inches and the names of things ("the vet", "the road"). Never use programming or editor words with them: no ids, coordinates, JSON, objects or layers.
Read the plan before answering anything about where things are or whether they fit, and work out fits from the numbers, allowing for each piece's rotation.
When they ask for a change, or agree to one you offered, call change_plan once with every change together; they confirm it with a tap. Keep pieces inside the house and off each other unless asked otherwise, and keep the road clear.
Answer in one to three short sentences. Give sizes in feet and inches, like 3' 6".`;
