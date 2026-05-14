// Board persistence — pure load/save with migrations.
// Both the Electron main process (handlers.ts) and the sys CLI
// (sys/commands/*.ts) read/write through this module.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

// ADR 0001 — local helper; mirrors HabitNode/types.ts toYMD but kept here to
// avoid importing renderer modules from the main process.
function todayLocalYMD(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

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
        state: {
          status: 'idle',
          startedAt: null,
          durationMin: 25,
          breakMin: 5,
          label: '',
          sessionsCompleted: 0,
          activeTaskId: null,
          history: [],
          pausedAt: null,
          pausedElapsedMs: 0,
        },
        // Decision 22 — canonical PomoConfig shape.
        config: { sessionMin: 25, shortBreakMin: 5, longBreakMin: 15, longBreakEvery: 4 },
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
      // ADR 0001 — fifth mother: Calendar
      {
        id: 'mother-calendar',
        kind: 'calendar',
        position: { x: 840, y: 0 },
        isMother: true,
        state: { selectedDate: null, anchorDate: todayLocalYMD() },
        config: {
          view: 'week',
          weekStartsOn: 'monday',
          showHabits: true,
          showPomoHeatmap: true,
          hourRange: { start: 6, end: 23 },
        },
      },
      // Decision 24.2 — sixth mother: Clock (12-hour visualization, viewWindow replaces windowStartHour)
      {
        id: 'mother-clock',
        kind: 'clock',
        position: { x: 1252, y: 0 },
        isMother: true,
        state: { linkedTodoId: null, viewWindow: 0 },
        config: {},
      },
    ],
    edges: [],
  };
}

const NEW_MOTHER_POSITIONS: Record<string, { x: number; y: number }> = {
  'mother-pomo':     { x: -808, y: 0 },
  'mother-todo':     { x: -396, y: 0 },
  'mother-habit':    { x:   16, y: 0 },
  'mother-term':     { x:  428, y: 0 },
  'mother-calendar': { x:  840, y: 0 }, // ADR 0001 — slot 5
  'mother-clock':    { x: 1252, y: 0 }, // Decision 23.1 — slot 6
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
  if (!b.viewport) {
    b.viewport = { x: 0, y: 220, zoom: 1 };
  }
  return b as Record<string, unknown>;
}

const STATE_DEFAULTS: Record<string, () => Record<string, unknown>> = {
  // Decision 22: `activeTaskId` is the new field on PomoState. Older boards
  // get it backfilled to `null` (default mode).
  // Decision 22.1: `pausedAt` and `pausedElapsedMs` backfill for pre-v2.1 boards.
  pomo: () => ({
    status: 'idle',
    startedAt: null,
    durationMin: 25,
    breakMin: 5,
    label: '',
    sessionsCompleted: 0,
    activeTaskId: null,
    history: [],
    pausedAt: null,
    pausedElapsedMs: 0,
  }),
  todo: () => ({ items: [] }),
  habit: () => ({ habits: [] }),
  term: () => ({ sessionId: null, title: 'Terminal' }),
  // Decision 20: parentTaskId / todoItemId / pomoSessionsCompleted backfill.
  // Decision 22: plannedMin / secondsAccumulated backfill.
  // Decision 22.1: currentSessionElapsedSec backfill for pre-v2.1 boards.
  'todo.task': () => ({
    parentTaskId: null,
    todoItemId: null,
    pomoSessionsCompleted: 0,
    plannedMin: 25,
    secondsAccumulated: 0,
    currentSessionElapsedSec: 0,
  }),
  // ADR 0001 — Calendar mother state defaults for boards migrated from pre-v1.
  calendar: () => ({ selectedDate: null, anchorDate: todayLocalYMD() }),
  // Decision 24.2 — viewWindow replaces windowStartHour. Old field migrated out
  // by migrateClockState; STATE_DEFAULTS supplies the canonical shape for
  // boards that arrive without it.
  clock: () => ({ linkedTodoId: null, viewWindow: 0 }),
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
// Decision #22 — canonicalise PomoConfig fields. Older boards used
// `{ shortBreakMin, longBreakMin, sessionsUntilLongBreak }` (seed) or
// `{ defaultDurationMin, defaultBreakMin, longBreakEvery, longBreakMin }`
// (v1 defaultPomoConfig). The canonical shape is
// `{ sessionMin, shortBreakMin, longBreakMin, longBreakEvery }`. The migration
// in `migratePomoConfig` below promotes legacy names; `CONFIG_DEFAULTS['pomo']`
// supplies a baseline when the entire config object is missing.
const CONFIG_DEFAULTS: Record<string, () => Record<string, unknown>> = {
  habit: () => ({ weekStartsOn: 'monday', view: 'week' }),
  pomo: () => ({ sessionMin: 25, shortBreakMin: 5, longBreakMin: 15, longBreakEvery: 4 }),
  // ADR 0001 — Calendar config defaults.
  calendar: () => ({
    view: 'week',
    weekStartsOn: 'monday',
    showHabits: true,
    showPomoHeatmap: true,
    hourRange: { start: 6, end: 23 },
  }),
};

// Decision 22 — heal pre-v2 PomoConfig shapes into the canonical fields.
function migratePomoConfig(board: Record<string, unknown>): Record<string, unknown> {
  const nodes = board['nodes'];
  if (!Array.isArray(nodes)) return board;
  board['nodes'] = nodes.map((n: unknown) => {
    if (typeof n !== 'object' || n === null) return n;
    const node = n as { kind?: string; config?: Record<string, unknown> | null };
    if (node.kind !== 'pomo') return n;
    const cfg = (node.config ?? {}) as Record<string, unknown>;
    const num = (...keys: string[]): number | undefined => {
      for (const k of keys) {
        const v = cfg[k];
        if (typeof v === 'number' && Number.isFinite(v)) return v;
      }
      return undefined;
    };
    const sessionMin = num('sessionMin', 'defaultDurationMin') ?? 25;
    const shortBreakMin = num('shortBreakMin', 'defaultBreakMin') ?? 5;
    const longBreakMin = num('longBreakMin') ?? 15;
    const longBreakEvery = num('longBreakEvery', 'sessionsUntilLongBreak') ?? 4;
    const canonical = { sessionMin, shortBreakMin, longBreakMin, longBreakEvery };
    return { ...node, config: { ...cfg, ...canonical } };
  });
  return board;
}

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

// ADR 0001 — inject the calendar mother into boards that pre-date this feature.
// Idempotent: no-op if 'mother-calendar' already exists.
// Runs BEFORE migrateNodeStates so the new node gets STATE/CONFIG_DEFAULTS healing.
function migrateAddCalendarMother(board: Record<string, unknown>): Record<string, unknown> {
  const nodes = board['nodes'];
  if (!Array.isArray(nodes)) return board;
  const alreadyExists = nodes.some((n: unknown) => {
    if (typeof n !== 'object' || n === null) return false;
    return (n as { id?: unknown })['id'] === 'mother-calendar';
  });
  if (alreadyExists) return board;
  board['nodes'] = [
    ...nodes,
    {
      id: 'mother-calendar',
      kind: 'calendar',
      position: { x: 840, y: 0 },
      isMother: true,
      state: { selectedDate: null, anchorDate: todayLocalYMD() },
      config: {
        view: 'week',
        weekStartsOn: 'monday',
        showHabits: true,
        showPomoHeatmap: true,
        hourRange: { start: 6, end: 23 },
      },
    },
  ];
  return board;
}

// Decision 23.1 — inject the clock mother into boards that pre-date this feature.
// Idempotent: no-op if 'mother-clock' already exists.
// Runs BEFORE migrateNodeStates so the new node gets STATE_DEFAULTS healing.
function migrateAddClockMother(board: Record<string, unknown>): Record<string, unknown> {
  const nodes = board['nodes'];
  if (!Array.isArray(nodes)) return board;
  const alreadyExists = nodes.some((n: unknown) => {
    if (typeof n !== 'object' || n === null) return false;
    return (n as { id?: unknown })['id'] === 'mother-clock';
  });
  if (alreadyExists) return board;
  board['nodes'] = [
    ...nodes,
    {
      id: 'mother-clock',
      kind: 'clock',
      position: { x: 1252, y: 0 },
      isMother: true,
      state: { linkedTodoId: null, viewWindow: 0 },
      config: {},
    },
  ];
  return board;
}

// Decision 24.2 — strip legacy windowStartHour from clock nodes; ensure
// viewWindow is set. Idempotent: safe to run on already-migrated boards
// (windowStartHour will simply be absent; viewWindow will already exist).
function migrateClockState(board: Record<string, unknown>): Record<string, unknown> {
  const nodes = board['nodes'];
  if (!Array.isArray(nodes)) return board;
  board['nodes'] = nodes.map((n: unknown) => {
    if (typeof n !== 'object' || n === null) return n;
    const node = n as { kind?: string; state?: Record<string, unknown> | null };
    if (node.kind !== 'clock') return n;
    const oldState = (node.state ?? {}) as Record<string, unknown>;
    // Strip windowStartHour, ensure viewWindow exists.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { windowStartHour, ...rest } = oldState;
    const viewWindow = rest['viewWindow'] === 1 ? 1 : 0;
    return { ...node, state: { ...rest, viewWindow } };
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

/**
 * Decision 22 — backfill `plannedMin` on existing task nodes that pre-date
 * the field. Use the existing `durationMin` if present so the budget shows
 * something meaningful instead of the global default. `secondsAccumulated`
 * is handled by STATE_DEFAULTS spread (defaults to 0).
 */
function migrateTaskPlannedMin(board: Record<string, unknown>): Record<string, unknown> {
  const nodes = board['nodes'];
  if (!Array.isArray(nodes)) return board;
  board['nodes'] = nodes.map((n: unknown) => {
    if (typeof n !== 'object' || n === null) return n;
    const node = n as { kind?: string; state?: Record<string, unknown> | null };
    if (node.kind !== 'todo.task') return n;
    const s = (node.state ?? {}) as Record<string, unknown>;
    if (typeof s['plannedMin'] === 'number') return n;
    const fallback = typeof s['durationMin'] === 'number' ? s['durationMin'] : 25;
    return { ...node, state: { ...s, plannedMin: fallback } };
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

/**
 * ADR 0003 §8 — heal pre-ADR boards that have multiple anchors in a single
 * chain. For each connected component of task.next edges restricted to one
 * todo, if more than one task carries scheduledFor, keep the earliest and
 * clear the rest (also clearing the linked TodoItem.scheduledFor mirror).
 *
 * Idempotent: a healed board has at most one anchor per chain, so a second
 * run is a no-op.
 *
 * Runs AFTER migrateNodeStates so STATE_DEFAULTS has already supplied any
 * missing fields. No BoardSchema.version bump — the persisted shape is
 * unchanged; only the runtime invariant is tightened.
 */
function migrateNormalizeChainAnchors(
  board: Record<string, unknown>,
): Record<string, unknown> {
  const nodes = board['nodes'];
  const edges = board['edges'];
  if (!Array.isArray(nodes)) return board;
  const edgeArr = Array.isArray(edges) ? edges : [];

  // Build per-todo task-id sets and remember each task's scheduledFor.
  type TaskShape = {
    id: string;
    kind: string;
    state?: {
      parentTodoId?: string;
      parentTaskId?: string | null;
      scheduledFor?: string;
      todoItemId?: string | null;
    } | null;
  };
  const tasksByTodo = new Map<string, string[]>();
  const stateById = new Map<string, NonNullable<TaskShape['state']>>();
  for (const n of nodes) {
    if (typeof n !== 'object' || n === null) continue;
    const node = n as TaskShape;
    if (node.kind !== 'todo.task') continue;
    const s = node.state ?? {};
    if (s.parentTaskId !== null && s.parentTaskId !== undefined) continue;
    const todoId = s.parentTodoId;
    if (typeof todoId !== 'string') continue;
    if (!tasksByTodo.has(todoId)) tasksByTodo.set(todoId, []);
    tasksByTodo.get(todoId)!.push(node.id);
    stateById.set(node.id, s);
  }

  // Build a task.next adjacency (undirected, for connectivity).
  type EdgeShape = { from?: { nodeId?: string; event?: string }; to?: { nodeId?: string } };
  const adj = new Map<string, Set<string>>();
  for (const e of edgeArr) {
    if (typeof e !== 'object' || e === null) continue;
    const ed = e as EdgeShape;
    if (ed.from?.event !== 'task.next') continue;
    const a = ed.from.nodeId;
    const b = ed.to?.nodeId;
    if (typeof a !== 'string' || typeof b !== 'string') continue;
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a)!.add(b);
    adj.get(b)!.add(a);
  }

  // For each todo, find connected components and pick the earliest anchor
  // per component. Tasks in the same component as a later anchor lose theirs.
  const toClear = new Set<string>(); // task ids whose scheduledFor must be cleared
  const todoItemClearByTodo = new Map<string, Set<string>>(); // todoId -> itemIds to clear

  for (const [, taskIds] of tasksByTodo) {
    const scope = new Set(taskIds);
    const seen = new Set<string>();
    for (const seed of taskIds) {
      if (seen.has(seed)) continue;
      // BFS component (restricted to this todo's task ids).
      const comp: string[] = [];
      const stack = [seed];
      while (stack.length > 0) {
        const id = stack.pop()!;
        if (seen.has(id)) continue;
        if (!scope.has(id)) continue;
        seen.add(id);
        comp.push(id);
        const nbrs = adj.get(id);
        if (!nbrs) continue;
        for (const n of nbrs) {
          if (!seen.has(n) && scope.has(n)) stack.push(n);
        }
      }
      // Anchors in this component.
      const anchors = comp.filter((id) => {
        const sf = stateById.get(id)?.scheduledFor;
        return typeof sf === 'string' && sf.length > 0;
      });
      if (anchors.length <= 1) continue;
      // Earliest scheduledFor wins; ties → ascending task id for determinism.
      anchors.sort((a, b) => {
        const ta = stateById.get(a)?.scheduledFor ?? '';
        const tb = stateById.get(b)?.scheduledFor ?? '';
        if (ta < tb) return -1;
        if (ta > tb) return 1;
        return a < b ? -1 : a > b ? 1 : 0;
      });
      for (let i = 1; i < anchors.length; i++) {
        const losingId = anchors[i]!;
        toClear.add(losingId);
        const s = stateById.get(losingId);
        if (s?.parentTodoId && s.todoItemId) {
          if (!todoItemClearByTodo.has(s.parentTodoId)) {
            todoItemClearByTodo.set(s.parentTodoId, new Set());
          }
          todoItemClearByTodo.get(s.parentTodoId)!.add(s.todoItemId);
        }
      }
    }
  }

  if (toClear.size === 0 && todoItemClearByTodo.size === 0) return board;

  board['nodes'] = nodes.map((n: unknown) => {
    if (typeof n !== 'object' || n === null) return n;
    const node = n as { id?: string; kind?: string; state?: Record<string, unknown> | null };
    // Clear scheduledFor (and scheduledDurationMin) on losing task nodes.
    if (
      node.kind === 'todo.task' &&
      typeof node.id === 'string' &&
      toClear.has(node.id)
    ) {
      const s = (node.state ?? {}) as Record<string, unknown>;
      const { scheduledFor: _sf, scheduledDurationMin: _sdm, ...rest } = s;
      void _sf;
      void _sdm;
      return { ...node, state: rest };
    }
    // Clear linked TodoItem mirrors.
    if (node.kind === 'todo' && typeof node.id === 'string') {
      const itemIds = todoItemClearByTodo.get(node.id);
      if (!itemIds) return n;
      const s = (node.state ?? {}) as { items?: unknown[] } & Record<string, unknown>;
      const items = s.items;
      if (!Array.isArray(items)) return n;
      const patched = items.map((it: unknown) => {
        if (typeof it !== 'object' || it === null) return it;
        const item = it as { id?: string; scheduledFor?: string };
        if (typeof item.id !== 'string' || !itemIds.has(item.id)) return it;
        const { scheduledFor: _sf, ...rest } = item;
        void _sf;
        return rest;
      });
      return { ...node, state: { ...s, items: patched } };
    }
    return n;
  });

  return board;
}

function validateBoardInvariants(board: unknown): unknown {
  if (typeof board !== 'object' || board === null) return board;
  const b = board as Record<string, unknown>;
  const nodes = b['nodes'];
  if (!Array.isArray(nodes)) return board;

  // Collect all TaskNode ids present in the board.
  const taskNodeIds = new Set<string>();
  for (const n of nodes) {
    if (typeof n !== 'object' || n === null) continue;
    const node = n as { kind?: string; id?: string };
    if (node.kind === 'todo.task' && typeof node.id === 'string') {
      taskNodeIds.add(node.id);
    }
  }

  // Strip TodoItems whose taskNodeId points to a TaskNode that no longer exists.
  const healed = nodes.map((n: unknown) => {
    if (typeof n !== 'object' || n === null) return n;
    const node = n as { kind?: string; state?: Record<string, unknown> };
    if (node.kind !== 'todo') return n;
    const items = node.state?.['items'];
    if (!Array.isArray(items)) return n;
    const before = items.length;
    const after = items.filter((item: unknown) => {
      if (typeof item !== 'object' || item === null) return true;
      const it = item as Record<string, unknown>;
      if (it['taskNodeId'] == null) return true;
      return taskNodeIds.has(it['taskNodeId'] as string);
    });
    if (after.length < before) {
      console.warn(`[board] dropped ${before - after.length} orphan TodoItem(s) on load`);
    }
    return { ...node, state: { ...(node.state ?? {}), items: after } };
  });

  return { ...b, nodes: healed };
}

export function loadBoardFrom(boardPath: string): unknown {
  try {
    if (existsSync(boardPath)) {
      const raw = readFileSync(boardPath, 'utf-8');
      const parsed: unknown = JSON.parse(raw);
      // Migration order matters: shape-promoting migrations (pomo config rename,
      // task plannedMin backfill from durationMin) must run BEFORE
      // `migrateNodeStates` so the canonical fields exist when STATE/CONFIG
      // DEFAULTS apply their baseline spread — otherwise the defaults clobber
      // legacy-derived values.
      // validateBoardInvariants runs last to heal any orphaned TodoItems before
      // the board is handed to the renderer.
      return validateBoardInvariants(
        migrateTodoItemFields(
          migrateHabitFields(
            // ADR 0003 §8 — heal pre-cascade boards that may have multiple
            // anchors per chain. Runs AFTER migrateNodeStates so task states
            // are already schema-healed.
            migrateNormalizeChainAnchors(
              migrateNodeStates(
              // Decision 24.2: migrateClockState strips legacy windowStartHour and
              // sets viewWindow BEFORE migrateNodeStates so STATE_DEFAULTS healing
              // doesn't re-add windowStartHour via the spread's right-operand win.
              migrateClockState(
                // ADR 0001: migrateAddCalendarMother runs before migrateNodeStates
                // so the injected calendar node gets STATE/CONFIG_DEFAULTS healing.
                // Decision 23.1: migrateAddClockMother runs immediately after
                // migrateAddCalendarMother (same reason — before migrateNodeStates).
                migrateAddClockMother(
                  migrateAddCalendarMother(
                    migrateTaskPlannedMin(
                      migratePomoConfig(
                        migrateMotherPositions(parsed),
                      ),
                    ),
                  ),
                ),
              ),
            ),
            ),
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
