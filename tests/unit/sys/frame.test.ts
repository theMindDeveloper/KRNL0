// Decision 29 §5 — frame CRUD CLI commands
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  frameAdd,
  frameLabel,
  frameResize,
  frameTint,
  frameList,
  frameContents,
  frameFit,
  type FrameCtx,
} from '../../../src/sys/commands/frame';
import type { FrameState, FrameConfig } from '../../../src/renderer/components/nodes/FrameNode/types';

let tmpDir = '';
let boardPath = '';
let ctx: FrameCtx;

interface NodeLike {
  id: string;
  kind: string;
  position?: { x: number; y: number };
  state: FrameState;
  config?: FrameConfig;
}

function readBoard(): { nodes: NodeLike[]; edges: unknown[] } {
  return JSON.parse(readFileSync(boardPath, 'utf-8'));
}

function getFrames(): NodeLike[] {
  return readBoard().nodes.filter((n) => n.kind === 'frame') as NodeLike[];
}

function seedBoard(extraNodes: NodeLike[] = []): void {
  const board = {
    version: 1,
    schemaVersion: 1,
    viewport: { x: -500, y: -300, zoom: 1 },
    nodes: [
      {
        id: 'source-node',
        kind: 'text',
        isMother: false,
        position: { x: 100, y: 200 },
        state: { text: 'hello', width: 200, height: 80 },
        config: {},
      },
      ...extraNodes,
    ],
    edges: [],
  };
  writeFileSync(boardPath, JSON.stringify(board), 'utf-8');
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'krnl0-frame-'));
  boardPath = join(tmpDir, 'board.json');
  seedBoard();
  ctx = { boardPath };
});

afterEach(() => {
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
});

describe('frame add', () => {
  it('adds a frame with defaults', async () => {
    const res = await frameAdd(ctx, {});
    expect(res.ok).toBe(true);
    const frames = getFrames();
    expect(frames).toHaveLength(1);
    expect(frames[0]!.state.width).toBe(360);
    expect(frames[0]!.state.height).toBe(240);
    expect(frames[0]!.state.label).toBe('');
    expect((frames[0]!.config as FrameConfig).tint).toBe('neutral');
  });

  it('respects --at x,y', async () => {
    const res = await frameAdd(ctx, { at: { x: 50, y: 75 } });
    expect(res.ok).toBe(true);
    const frames = getFrames();
    expect(frames[0]!.position).toEqual({ x: 50, y: 75 });
  });

  it('respects custom --w, --h, --tint, --label', async () => {
    const res = await frameAdd(ctx, { w: 500, h: 400, tint: 'cyan', label: 'My Group' });
    expect(res.ok).toBe(true);
    const frames = getFrames();
    expect(frames[0]!.state.width).toBe(500);
    expect(frames[0]!.state.height).toBe(400);
    expect((frames[0]!.config as FrameConfig).tint).toBe('cyan');
    expect(frames[0]!.state.label).toBe('My Group');
  });

  it('uses viewport center as default position', async () => {
    // viewport = {x: -500, y: -300, zoom: 1} => canvas center = (500, 300)
    const res = await frameAdd(ctx, {});
    expect(res.ok).toBe(true);
    const frames = getFrames();
    // center = (500, 300), frame half-size = (180, 120)
    expect(frames[0]!.position!.x).toBe(500 - 180);
    expect(frames[0]!.position!.y).toBe(300 - 120);
  });

  it('--near centers frame on source node, auto-sizes to fit + padding, seeds childIds', async () => {
    // source-node: position={x:100, y:200}, w=200, h=80
    // srcCenter = (100 + 100, 200 + 40) = (200, 240)
    // Without --w / --h, the frame auto-sizes:
    //   width  = max(FRAME_MIN_W=320, src.w (200) + 2*FRAME_PADDING (40)) = 320
    //   height = max(FRAME_MIN_H=200, src.h (80)  + 2*FRAME_PADDING (40)) = 200
    // frame top-left = (200 - 320/2, 240 - 200/2) = (40, 140)
    const res = await frameAdd(ctx, { near: 'source-node' });
    expect(res.ok).toBe(true);
    const frames = getFrames();
    expect(frames[0]!.state.width).toBe(320);
    expect(frames[0]!.state.height).toBe(200);
    expect(frames[0]!.position!.x).toBe(40);
    expect(frames[0]!.position!.y).toBe(140);
    expect(frames[0]!.state.childIds).toEqual(['source-node']);
  });

  it('--near with id prefix works', async () => {
    const res = await frameAdd(ctx, { near: 'source' });
    expect(res.ok).toBe(true);
    const frames = getFrames();
    expect(frames[0]!.state.childIds).toEqual(['source-node']);
  });

  it('returns error for unknown --near ref', async () => {
    const res = await frameAdd(ctx, { near: 'nonexistent' });
    expect(res.ok).toBe(false);
  });
});

describe('frame label', () => {
  it('updates frame label', async () => {
    await frameAdd(ctx, {});
    const frames = getFrames();
    const id = frames[0]!.id;
    const res = await frameLabel(ctx, id, 'Updated Label');
    expect(res.ok).toBe(true);
    expect(getFrames()[0]!.state.label).toBe('Updated Label');
  });

  it('resolves frame by prefix', async () => {
    await frameAdd(ctx, {});
    const frames = getFrames();
    const prefix = frames[0]!.id.slice(0, 8);
    const res = await frameLabel(ctx, prefix, 'Prefix Label');
    expect(res.ok).toBe(true);
  });
});

describe('frame resize', () => {
  it('resizes a frame', async () => {
    await frameAdd(ctx, {});
    const id = getFrames()[0]!.id;
    const res = await frameResize(ctx, id, 800, 600);
    expect(res.ok).toBe(true);
    const f = getFrames()[0]!;
    expect(f.state.width).toBe(800);
    expect(f.state.height).toBe(600);
  });

  it('rejects invalid dimensions', async () => {
    await frameAdd(ctx, {});
    const id = getFrames()[0]!.id;
    const res = await frameResize(ctx, id, -1, 200);
    expect(res.ok).toBe(false);
  });
});

describe('frame tint', () => {
  it('updates frame tint', async () => {
    await frameAdd(ctx, {});
    const id = getFrames()[0]!.id;
    const res = await frameTint(ctx, id, 'rust');
    expect(res.ok).toBe(true);
    expect((getFrames()[0]!.config as FrameConfig).tint).toBe('rust');
  });

  it('rejects invalid tint', async () => {
    await frameAdd(ctx, {});
    const id = getFrames()[0]!.id;
    const res = await frameTint(ctx, id, 'purple');
    expect(res.ok).toBe(false);
  });
});

describe('frame list', () => {
  it('returns empty list when no frames', async () => {
    const res = await frameList(ctx, false);
    expect(res.ok).toBe(true);
    expect(res.message).toContain('no frames');
  });

  it('lists frames as JSON', async () => {
    await frameAdd(ctx, { label: 'Group A' });
    await frameAdd(ctx, { label: 'Group B' });
    const res = await frameList(ctx, true);
    expect(res.ok).toBe(true);
    const data = JSON.parse(res.message ?? '[]');
    expect(data).toHaveLength(2);
  });
});

describe('frame contents', () => {
  it('returns empty childIds for a new frame', async () => {
    await frameAdd(ctx, {});
    const id = getFrames()[0]!.id;
    const res = await frameContents(ctx, id, false);
    expect(res.ok).toBe(true);
    expect(res.message).toContain('no children');
  });

  it('returns childIds as JSON', async () => {
    await frameAdd(ctx, { near: 'source-node' });
    const id = getFrames()[0]!.id;
    const res = await frameContents(ctx, id, true);
    expect(res.ok).toBe(true);
    const data = JSON.parse(res.message ?? '[]');
    expect(data).toEqual(['source-node']);
  });

  it('reads persisted childIds without recomputing geometry', async () => {
    // This is the contract: read state, not spatial math
    await frameAdd(ctx, { near: 'source-node' });
    const id = getFrames()[0]!.id;
    const res = await frameContents(ctx, id, true);
    const data = JSON.parse(res.message ?? '[]');
    expect(data).toHaveLength(1);
    expect(data[0]).toBe('source-node');
  });
});

describe('frame fit', () => {
  it('resizes and repositions the frame to wrap childIds with default padding', async () => {
    // source-node (text): pos (100,200) size 200×80
    await frameAdd(ctx, { near: 'source-node', w: 100, h: 100 });
    // Manually shrink so we can verify fit re-grows. Start tiny.
    const id = getFrames()[0]!.id;
    // bbox of childIds is just source-node: (100,200) → (300,280).
    // padding default = 40 → frame pos (60,160), size 280×160. But the
    // size hits FRAME_MIN_W=320 and FRAME_MIN_H=200 floors, so:
    //   width  = max(320, 200 + 80) = 320
    //   height = max(200,  80 + 80) = 200
    // position stays at bbox.min - padding = (60, 160).
    const res = await frameFit(ctx, id, undefined);
    expect(res.ok).toBe(true);
    const frame = getFrames().find((f) => f.id === id)!;
    expect(frame.state.width).toBe(320);
    expect(frame.state.height).toBe(200);
    expect(frame.position!.x).toBe(60);
    expect(frame.position!.y).toBe(160);
  });

  it('respects --padding override', async () => {
    await frameAdd(ctx, { near: 'source-node', w: 100, h: 100 });
    const id = getFrames()[0]!.id;
    // padding = 100 → frame pos (0, 100), size = max(320, 200+200)=400, max(200, 80+200)=280
    const res = await frameFit(ctx, id, 100);
    expect(res.ok).toBe(true);
    const frame = getFrames().find((f) => f.id === id)!;
    expect(frame.state.width).toBe(400);
    expect(frame.state.height).toBe(280);
    expect(frame.position!.x).toBe(0);
    expect(frame.position!.y).toBe(100);
  });

  it('refuses to fit when childIds is empty AND no node sits inside the frame', async () => {
    // Default frame is centered on viewport (500,300), size 360×240,
    // so it occupies x ∈ [320, 680], y ∈ [180, 420]. seedBoard's
    // source-node is at (100,200) size 200×80, center (200,240) —
    // outside [320,680]. No gather candidates, no seed childIds → refuse.
    await frameAdd(ctx, {});
    const id = getFrames()[0]!.id;
    const res = await frameFit(ctx, id, undefined);
    expect(res.ok).toBe(false);
    expect(res.message).toContain('nothing inside');
  });

  it('gathers nodes whose centers sit inside the frame bounds into childIds', async () => {
    // Add a frame big enough to contain source-node spatially, but
    // without --near so its initial childIds is empty.
    await frameAdd(ctx, { at: { x: 0, y: 100 }, w: 500, h: 300 });
    const id = getFrames()[0]!.id;
    // source-node center is (200, 240). Frame is x ∈ [0,500], y ∈ [100,400].
    // → center is inside.
    expect(getFrames().find((f) => f.id === id)!.state.childIds).toEqual([]);
    const res = await frameFit(ctx, id, undefined);
    expect(res.ok).toBe(true);
    const frame = getFrames().find((f) => f.id === id)!;
    expect(frame.state.childIds).toEqual(['source-node']);
  });

  it('does NOT gather mother nodes or other frames into childIds', async () => {
    // Add a mother + another frame both inside the bounds of a big test frame.
    const raw = JSON.parse(readFileSync(boardPath, 'utf-8'));
    raw.nodes.push(
      { id: 'mother-todo', kind: 'todo', isMother: true, position: { x: 50, y: 150 }, state: { items: [] }, config: {} },
      { id: 'other-frame', kind: 'frame', isMother: false, position: { x: 80, y: 180 }, state: { label: '', width: 100, height: 60, childIds: [] }, config: { tint: 'neutral' } },
    );
    writeFileSync(boardPath, JSON.stringify(raw), 'utf-8');

    await frameAdd(ctx, { at: { x: 0, y: 100 }, w: 500, h: 400 });
    const id = getFrames().find((f) => f.id !== 'other-frame')!.id;
    const res = await frameFit(ctx, id, undefined);
    expect(res.ok).toBe(true);
    const frame = getFrames().find((f) => f.id === id)!;
    // source-node gathered; mother + other frame excluded.
    expect(frame.state.childIds).toContain('source-node');
    expect(frame.state.childIds).not.toContain('mother-todo');
    expect(frame.state.childIds).not.toContain('other-frame');
  });

  it('refuses to fit when no childIds resolve to live nodes', async () => {
    await frameAdd(ctx, { near: 'source-node' });
    const id = getFrames()[0]!.id;
    // Manually delete source-node from the board so the childId becomes stale.
    const raw = JSON.parse(readFileSync(boardPath, 'utf-8'));
    raw.nodes = raw.nodes.filter((n: NodeLike) => n.id !== 'source-node');
    writeFileSync(boardPath, JSON.stringify(raw), 'utf-8');
    const res = await frameFit(ctx, id, undefined);
    expect(res.ok).toBe(false);
    expect(res.message).toContain('resolve to live nodes');
  });
});
