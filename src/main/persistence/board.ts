// Board persistence — pure load/save with migrations.
// Both the Electron main process (handlers.ts) and the sys CLI
// (sys/commands/*.ts) read/write through this module.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

export interface PartialBoard {
  version?: number;
  schemaVersion?: number;
  savedAt?: string;
  viewport?: { x: number; y: number; zoom: number };
  nodes: unknown[];
  edges: unknown[];
}

export function seedBoard(): PartialBoard {
  return {
    version: 1,
    schemaVersion: 1,
    savedAt: new Date().toISOString(),
    viewport: { x: 0, y: 220, zoom: 1 },
    nodes: [
      {
        id: 'mother-pomo',
        kind: 'pomo',
        position: { x: -808, y: 0 },
        isMother: true,
        state: { status: 'idle', startedAt: null, durationMin: 25, label: '', sessionsCompleted: 0, history: [] },
        config: { shortBreakMin: 5, longBreakMin: 15, sessionsUntilLongBreak: 4 },
      },
      {
        id: 'mother-todo',
        kind: 'todo',
        position: { x: -396, y: 0 },
        isMother: true,
        state: { items: [] },
        config: { showCompleted: true, maxVisible: 50 },
      },
      {
        id: 'mother-habit',
        kind: 'habit',
        position: { x: 16, y: 0 },
        isMother: true,
        state: { habits: [] },
        config: { maxHabits: 5, weekStartsOn: 'monday', view: 'week' },
      },
      {
        id: 'mother-term',
        kind: 'term',
        position: { x: 428, y: 0 },
        isMother: true,
        state: { sessionId: null, title: 'Terminal' },
        config: { shell: 'default', fontSize: 13 },
      },
    ],
    edges: [],
  };
}

const NEW_MOTHER_POSITIONS: Record<string, { x: number; y: number }> = {
  'mother-pomo':  { x: -808, y: 0 },
  'mother-todo':  { x: -396, y: 0 },
  'mother-habit': { x:   16, y: 0 },
  'mother-term':  { x:  428, y: 0 },
};

function migrateMotherPositions(board: unknown): Record<string, unknown> {
  if (
    typeof board !== 'object' ||
    board === null ||
    !('nodes' in board) ||
    !Array.isArray((board as { nodes: unknown }).nodes)
  ) {
    return typeof board === 'object' && board !== null
      ? (board as Record<string, unknown>)
      : {};
  }
  const b = board as {
    nodes: unknown[];
    viewport?: { x: number; y: number; zoom: number };
  };
  b.nodes = b.nodes.map((n) => {
    if (typeof n !== 'object' || n === null || !('id' in n)) return n;
    const node = n as { id: string; position?: { x: number; y: number }; isMother?: boolean };
    const newPos = NEW_MOTHER_POSITIONS[node.id];
    if (newPos) {
      return { ...node, position: newPos, isMother: true };
    }
    return node;
  });
  if (b.viewport) {
    b.viewport = { ...b.viewport, x: 0, y: 220, zoom: 1 };
  }
  return b as Record<string, unknown>;
}

function migrateTaskChain(board: Record<string, unknown>): Record<string, unknown> {
  const nodes = board['nodes'];
  if (!Array.isArray(nodes)) return board;
  const edges = board['edges'];
  const edgeArr = Array.isArray(edges) ? edges : [];

  type TaskNodeShape = { id: string; kind: string; state?: { createdAt?: string } };
  const tasks = nodes.filter((n: unknown): n is TaskNodeShape => {
    return typeof n === 'object' && n !== null && (n as { kind?: unknown }).kind === 'todo.task';
  });
  if (tasks.length === 0) {
    board['edges'] = edgeArr;
    return board;
  }

  const taskIds = new Set(tasks.map((t) => t.id));

  const sorted = [...tasks].sort((a, b) => {
    const ca = a.state?.createdAt ?? '';
    const cb = b.state?.createdAt ?? '';
    return ca < cb ? -1 : ca > cb ? 1 : 0;
  });

  type EdgeShape = { id: string; from: { nodeId: string; event: string }; to: { nodeId: string; command: string }; enabled?: boolean };
  const cleaned = edgeArr.filter((e: unknown) => {
    if (typeof e !== 'object' || e === null) return false;
    const ed = e as { to?: { nodeId?: string } };
    return !taskIds.has(ed.to?.nodeId ?? '');
  }) as EdgeShape[];

  for (let i = 1; i < sorted.length; i++) {
    cleaned.push({
      id: `edge-chain-${sorted[i]!.id}`,
      from: { nodeId: sorted[i - 1]!.id, event: 'task.next' },
      to: { nodeId: sorted[i]!.id, command: 'task.activate' },
      enabled: true,
    });
  }
  board['edges'] = cleaned;
  return board;
}

const STATE_DEFAULTS: Record<string, () => Record<string, unknown>> = {
  pomo: () => ({
    status: 'idle',
    startedAt: null,
    durationMin: 25,
    breakMin: 5,
    label: '',
    sessionsCompleted: 0,
    history: [],
  }),
  todo: () => ({ items: [] }),
  habit: () => ({ habits: [] }),
  term: () => ({ sessionId: null, title: 'Terminal' }),
  // Decision 20: backfill new fields on existing task nodes at load time
  'todo.task': () => ({
    parentTaskId: null,
    todoItemId: null,
    pomoSessionsCompleted: 0,
    pomoElapsedMs: 0,
    pomoStartedAt: null,
    pomoTargetMin: 0,
  }),
  // Decision 21: heal text/image child nodes saved with partial state.
  text: () => ({ text: '' }),
  image: () => ({
    assetId: null,
    naturalWidth: null,
    naturalHeight: null,
    mimeType: null,
    alt: '',
  }),
};

// Decision #14 — back-fill v2 config defaults on existing habit mother nodes
// so reloads of pre-v2 board.json don't surface an undefined view.
const CONFIG_DEFAULTS: Record<string, () => Record<string, unknown>> = {
  habit: () => ({ weekStartsOn: 'monday', view: 'week' }),
};

// Per-habit color back-fill — v2 habit schema requires `color`. Render-time
// fallback handles unwritten habits but persistent writes (re-saves) should
// store the resolved default so the file matches the schema.
function migrateHabitFields(board: Record<string, unknown>): Record<string, unknown> {
  const nodes = board['nodes'];
  if (!Array.isArray(nodes)) return board;
  board['nodes'] = nodes.map((n: unknown) => {
    if (typeof n !== 'object' || n === null) return n;
    const node = n as { kind?: string; state?: { habits?: unknown[] } };
    if (node.kind !== 'habit') return n;
    const habits = node.state?.habits;
    if (!Array.isArray(habits)) return n;
    const patched = habits.map((h: unknown) => {
      if (typeof h !== 'object' || h === null) return h;
      const hb = h as { color?: unknown };
      if (typeof hb.color === 'string') return hb;
      return { ...hb, color: 'acid' };
    });
    return { ...node, state: { ...(node.state ?? {}), habits: patched } };
  });
  return board;
}

function migrateNodeStates(board: Record<string, unknown>): Record<string, unknown> {
  const nodes = board['nodes'];
  if (!Array.isArray(nodes)) return board;
  board['nodes'] = nodes.map((n: unknown) => {
    if (typeof n !== 'object' || n === null || !('kind' in n)) return n;
    const node = n as { kind: string; state?: Record<string, unknown>; config?: Record<string, unknown> };
    const stateDefaults = STATE_DEFAULTS[node.kind];
    const configDefaults = CONFIG_DEFAULTS[node.kind];
    const patch: Record<string, unknown> = { ...node };
    if (stateDefaults) patch['state'] = { ...stateDefaults(), ...(node.state ?? {}) };
    if (configDefaults) patch['config'] = { ...configDefaults(), ...(node.config ?? {}) };
    return patch;
  });
  return board;
}

/** Decision 20: backfill taskNodeId on TodoItems that are missing it. */
function migrateTodoItemFields(board: Record<string, unknown>): Record<string, unknown> {
  const nodes = board['nodes'];
  if (!Array.isArray(nodes)) return board;
  board['nodes'] = nodes.map((n: unknown) => {
    if (typeof n !== 'object' || n === null) return n;
    const node = n as { kind?: string; state?: { items?: unknown[] } };
    if (node.kind !== 'todo') return n;
    const items = node.state?.items;
    if (!Array.isArray(items)) return n;
    const patched = items.map((item: unknown) => {
      if (typeof item !== 'object' || item === null) return item;
      const it = item as { taskNodeId?: unknown };
      if ('taskNodeId' in it) return it;
      return { ...it, taskNodeId: null };
    });
    return { ...node, state: { ...(node.state ?? {}), items: patched } };
  });
  return board;
}

export function loadBoardFrom(boardPath: string): unknown {
  try {
    if (existsSync(boardPath)) {
      const raw = readFileSync(boardPath, 'utf-8');
      const parsed: unknown = JSON.parse(raw);
      return migrateTodoItemFields(
        migrateHabitFields(
          migrateNodeStates(
            migrateTaskChain(migrateMotherPositions(parsed)),
          ),
        ),
      );
    }
  } catch {
    // fall through to seed
  }
  return seedBoard();
}

export function saveBoardTo(boardPath: string, data: unknown): void {
  try {
    const dir = dirname(boardPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(boardPath, JSON.stringify(data, null, 2), 'utf-8');
  } catch {
    // best-effort
  }
}
