// DEV-ONLY browser preview bridge.
//
// `vite --config vite.preview.config.ts` serves the renderer in a plain
// browser where Electron's preload (window.krnl) is missing, so no board ever
// loads. index.tsx installs this fake bridge only when import.meta.env.DEV is
// true and window.krnl is absent, so production builds never include it.
//
// `?fixture=<name>` picks the board. Fixtures are built relative to "today" so
// the week/day views always have something to show.

type Json = Record<string, unknown>;

const pad = (n: number) => String(n).padStart(2, '0');

function localISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function at(hh: number, mm = 0, dayOffset = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hh, mm, 0, 0);
  return d;
}

function mothers(): Json[] {
  const today = ymd(new Date());
  return [
    {
      id: 'mother-pomo', kind: 'pomo', position: { x: -1400, y: 0 }, isMother: true,
      state: {
        status: 'idle', startedAt: null, durationMin: 25, breakMin: 5, label: '',
        sessionsCompleted: 0, activeTaskId: null, history: [], pausedAt: null,
        pausedElapsedMs: 0, sessionWorkSec: 0,
      },
      config: { sessionMin: 25, shortBreakMin: 5, longBreakMin: 15, longBreakEvery: 4, face: 'blocks', stationSlot: 'top-left' },
    },
    {
      id: 'mother-todo', kind: 'todo', position: { x: -840, y: 0 }, isMother: true,
      state: { items: [] }, config: { showCompleted: true, maxVisible: 50, stationSlot: 'top-center' },
    },
    {
      id: 'mother-habit', kind: 'habit', position: { x: -280, y: 0 }, isMother: true,
      state: { habits: [] }, config: { maxHabits: 5, weekStartsOn: 'monday', view: 'week', stationSlot: 'top-right-pre' },
    },
    {
      id: 'mother-calendar', kind: 'calendar', position: { x: 280, y: 0 }, isMother: true,
      state: { selectedDate: null, anchorDate: today },
      config: { view: 'week', weekStartsOn: 'monday', showHabits: true, showPomoHeatmap: true, hourRange: { start: 6, end: 23 }, stationSlot: 'top-right-upper' },
    },
    {
      id: 'mother-clock', kind: 'clock', position: { x: 840, y: 0 }, isMother: true,
      state: { linkedTodoId: null, viewWindow: 0, selectedDate: today }, config: { stationSlot: 'top-right-lower' },
    },
    {
      id: 'mother-term', kind: 'term', position: { x: 1400, y: 0 }, isMother: true,
      state: { sessionId: null, title: 'Terminal' }, config: { shell: 'default', fontSize: 13, stationSlot: 'bottom-strip' },
    },
  ];
}

let seq = 0;

function addTask(nodes: Json[], items: Json[], id: string, text: string, plannedMin: number, scheduledFor?: Date, extra: Json = {}): void {
  seq++;
  const itemId = `item-${id}`;
  items.push({
    id: itemId, text, done: false, createdAt: new Date(Date.now() - (100 - seq) * 1000).toISOString(),
    completedAt: null, taskNodeId: id, ...(scheduledFor ? { scheduledFor: localISO(scheduledFor) } : {}),
  });
  nodes.push({
    id, kind: 'todo.task', position: { x: -840 + (seq % 4) * 300, y: 620 + Math.floor(seq / 4) * 180 }, isMother: false,
    state: {
      text, done: false, durationMin: plannedMin, eta: `~${plannedMin} min`, sequenceNumber: seq, layer: 0,
      createdAt: new Date(Date.now() - (100 - seq) * 1000).toISOString(), parentTodoId: 'mother-todo',
      parentTaskId: null, todoItemId: itemId, pomoSessionsCompleted: 0, plannedMin, secondsAccumulated: 0,
      currentSessionElapsedSec: 0, kind: 'event',
      ...(scheduledFor ? { scheduledFor: localISO(scheduledFor), scheduledDurationMin: plannedMin } : {}),
      ...extra,
    },
    config: { showDuration: true },
  });
}

function chain(edges: Json[], from: string, to: string): void {
  edges.push({ id: `edge-${from}-${to}`, from: { nodeId: from, event: 'task.next' }, to: { nodeId: to, command: 'task.activate' }, enabled: true });
}

function span(id: string, start: Date, end: Date, kind: 'work' | 'break', taskId: string | null, label: string): Json {
  return {
    id, startedAt: start.toISOString(), endedAt: end.toISOString(),
    durationMin: Math.round((end.getTime() - start.getTime()) / 60000), label, completed: kind === 'work',
    taskId, kind,
  };
}

/** Every layout failure case at once: forks, overlaps, crowding, midnight, reality. */
function stressBoard(): Json {
  seq = 0;
  const nodes = mothers();
  const edges: Json[] = [];
  const items: Json[] = [];

  // Chain with a 3-way parallel fork: Study → (Read A | Read B | Read C) → Summarize
  addTask(nodes, items, 't-study', 'Study math', 60, at(9, 0));
  addTask(nodes, items, 't-read-a', 'Read chapter A', 45);
  addTask(nodes, items, 't-read-b', 'Read chapter B', 30);
  addTask(nodes, items, 't-read-c', 'Read chapter C', 60);
  addTask(nodes, items, 't-sum', 'Summarize notes', 30);
  chain(edges, 't-study', 't-read-a');
  chain(edges, 't-study', 't-read-b');
  chain(edges, 't-study', 't-read-c');
  chain(edges, 't-read-a', 't-sum');
  chain(edges, 't-read-b', 't-sum');
  chain(edges, 't-read-c', 't-sum');

  // Independent task overlapping the fork.
  addTask(nodes, items, 't-call', 'Call with Sam', 90, at(10, 15));

  // Five short tasks crowded into one hour.
  ['Email', 'Groceries', 'Pay rent', 'Laundry', 'Plan week'].forEach((t, i) => {
    addTask(nodes, items, `t-crowd-${i}`, t, 20, at(14, i * 10));
  });

  // Crosses midnight.
  addTask(nodes, items, 't-late', 'Late coding', 150, at(22, 30));

  // Tomorrow: two-task chain.
  addTask(nodes, items, 't-tmr-1', 'Physics', 120, at(9, 30, 1));
  addTask(nodes, items, 't-tmr-2', 'Physics exercises', 60);
  chain(edges, 't-tmr-1', 't-tmr-2');

  const todo = nodes.find((n) => n.id === 'mother-todo')!;
  todo['state'] = { items };

  // Pomo reality: work, pause gap, work, break, work.
  const pomo = nodes.find((n) => n.id === 'mother-pomo')!;
  (pomo['state'] as Json)['history'] = [
    span('r1', at(9, 5), at(9, 50), 'work', 't-study', 'Study math'),
    span('r2', at(10, 5), at(10, 40), 'work', 't-study', 'Study math'),
    span('r3', at(10, 40), at(10, 55), 'break', null, ''),
    span('r4', at(10, 55), at(11, 45), 'work', 't-read-a', 'Read chapter A'),
    span('r5', at(14, 0), at(14, 25), 'work', null, ''),
  ];

  // Finished tasks + a deleted one in the completion ledger, so the analytics
  // "Plan vs actual" view has something to compare.
  for (const id of ['t-study', 't-read-a', 't-read-b']) {
    const st = nodes.find((n) => n.id === id)!['state'] as Json;
    st['done'] = true;
    st['completedAt'] = at(12, 0).toISOString();
  }
  (pomo['state'] as Json)['history'] = [
    ...((pomo['state'] as Json)['history'] as Json[]),
    span('r6', at(16, 0, -2), at(17, 40, -2), 'work', 'gone-essay', 'Essay draft'),
    span('r7', at(10, 0, -3), at(10, 50, -3), 'work', 't-read-b', 'Read chapter B'),
    span('r8', at(15, 0, -4), at(16, 10, -4), 'work', null, ''),
  ];
  nodes.push({
    // Decision 32 — analytics is the seventh mother (slot 'main').
    id: 'mother-analytics', kind: 'analytics', position: { x: 1960, y: 0 }, isMother: true,
    state: { view: 'estimates', rangeDays: 7, metric: 'taskCount', width: 540, height: 540, hiddenCards: [], pinnedCards: [], settingsOpen: false },
    config: { stationSlot: 'bottom-right-pre' },
  });

  const habit = nodes.find((n) => n.id === 'mother-habit')!;
  habit['state'] = {
    habits: [
      { id: 'h-run', name: 'Run', createdAt: new Date(Date.now() - 20 * 864e5).toISOString(), log: [], archived: false, color: 'acid', schedule: { kind: 'daily', timeOfDay: '07:00', durationMin: 30 } },
    ],
  };

  return {
    version: 1, schemaVersion: 2, savedAt: new Date().toISOString(),
    viewport: { x: 0, y: 220, zoom: 1 }, layoutMode: 'station', nodes, edges,
    completions: [
      { taskId: 'gone-essay', text: 'Essay draft', plannedMin: 60, completedAt: at(18, 0, -2).toISOString() },
      ...['t-study', 't-read-a', 't-read-b'].map((id) => {
        const st = nodes.find((n) => n.id === id)!['state'] as Json;
        return { taskId: id, text: st['text'], plannedMin: st['plannedMin'], completedAt: st['completedAt'] };
      }),
    ],
  };
}

const FIXTURES: Record<string, () => Json> = { stress: stressBoard };

export function installPreviewBridge(): void {
  const name = new URLSearchParams(location.search).get('fixture') ?? 'stress';
  const build = FIXTURES[name] ?? stressBoard;
  let board: unknown = build();
  const noop = async () => {};
  const bridge = {
    boardLoad: async () => board,
    boardSave: async (data: unknown) => { board = data; },
    boardReset: async () => (board = build()),
    boardSaveViewport: noop,
    ptyCreate: async () => ({ sessionId: 'preview', motd: 'preview mode — no shell' }),
    ptyWrite: noop, ptyResize: noop, ptyKill: noop,
    onPtyData: () => () => {}, onPtyExit: () => () => {},
    assetWrite: async () => ({ assetId: 'none', ext: 'png' }),
    assetRead: async () => null,
    assetDelete: noop,
    onBoardChanged: () => () => {},
    clipboardReadText: async () => '',
    clipboardWriteText: noop,
  };
  window.krnl = bridge as unknown as KrnlBridge;
}
