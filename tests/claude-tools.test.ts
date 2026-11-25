import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyAgentOps, AgentOpError } from '$lib/utils/agentOps';
import { readProject } from '$lib/utils/projectValidation';
import { changesToOps, planForClaude } from '$lib/utils/claudeTools';

const plan = () => readProject(JSON.parse(readFileSync(new URL('./fixtures/room-with-boxes.openplan.json', import.meta.url), 'utf8')));
const piece = (project: any, id: string) => project.floors[0].furniture.find((f: any) => f.id === id);

describe('what Claude reads', () => {
  it('gives every piece by name, centre and size in feet, and marks locked ones', () => {
    const read = planForClaude(plan());
    expect(read.pieces.find(p => p.id === 'box-a')).toEqual({ id: 'box-a', name: 'Box A', x: 4.9, y: 6.6, width: 3.9, depth: 3, height: expect.any(Number), rotation: 0 });
    expect(read.pieces.find(p => p.id === 'rug')).toMatchObject({ name: 'Rug', locked: true });
    expect(read.house).toMatchObject({ left: expect.any(Number), right: expect.any(Number) });
  });
});

describe("Claude's changes", () => {
  it('moves and resizes a piece in feet, and lands as checked edits', () => {
    const project = plan();
    const ops = changesToOps(project, [{ id: 'box-a', x: 10, width: 5 }]);
    const next: any = applyAgentOps(project, ops).project;
    expect(piece(next, 'box-a').position).toEqual({ x: 304.8, y: 200 });
    expect(piece(next, 'box-a').width).toBeCloseTo(152.4);
    expect(piece(next, 'box-a').scale).toEqual({ x: 1, y: 1, z: 1 });
  });

  it('adds a named box, and removes a piece', () => {
    const project = plan();
    const next: any = applyAgentOps(project, changesToOps(project, [
      { name: 'Bounce house', x: 8, y: 6, width: 9, depth: 8 }, { id: 'box-b', remove: true },
    ])).project;
    const added = next.floors[0].furniture.find((f: any) => f.name === 'Bounce house');
    expect(added).toMatchObject({ catalogId: 'imported_object', position: { x: 8 * 30.48, y: 6 * 30.48 } });
    expect(added.width).toBeCloseTo(9 * 30.48);
    expect(piece(next, 'box-b')).toBeUndefined();
  });

  it('turns a piece, keeping the angle between 0 and 360', () => {
    const project = plan();
    expect(changesToOps(project, [{ id: 'box-a', rotation: -90 }])).toEqual([{ op: 'update', id: 'box-a', set: { rotation: 270 } }]);
  });

  it('refuses a locked piece, an unknown id, a bad size and an empty change, changing nothing', () => {
    const project = plan();
    for (const changes of [[{ id: 'rug', x: 1 }], [{ id: 'nope', x: 1 }], [{ id: 'box-a', width: 0 }], [{ id: 'box-a' }], [{ name: 'Box' }], []]) {
      expect(() => changesToOps(project, changes as any)).toThrow(AgentOpError);
    }
    expect(() => changesToOps(project, [{ id: 'rug', x: 1 }])).toThrow(/locked/);
  });
});
