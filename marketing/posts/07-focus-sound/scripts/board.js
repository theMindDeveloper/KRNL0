// Injected before the app: replaces the preview bridge's board with a composed "day canvas".
// Two columns of 540 px windows (Todos | Calendar, Habits | Timer) over a frame of notes. Nothing else is on it:
// the unused windows (Clock, Analytics, Terminal) are parked far away so they never enter a shot.
(() => {
  const pad = (n) => String(n).padStart(2, '0');
  const DAY = '2026-11-24';
  const at = (h, m = 0) => `${DAY}T${pad(h)}:${pad(m)}:00`;
  const mutate = (b) => {
    const nodes = b.nodes;
    const byKind = (k) => nodes.find((n) => n.kind === k);
    const place = (n, x, y, w, h) => { n.position = { x, y }; n.config = { ...n.config, canvasSize: { width: w, height: h } }; };

    // ── windows ── (the app draws them as one row, in x order; Clock/Analytics/Terminal go last and stay hidden in the film)
    const todo = byKind('todo'), cal = byKind('calendar'), habit = byKind('habit'), pomo = byKind('pomo');
    place(todo, 0, 0, 540, 540); place(cal, 100, 0, 540, 540); place(habit, 200, 0, 540, 540); place(pomo, 300, 0, 540, 540);
    byKind('clock').position = { x: 400, y: 0 }; byKind('analytics').position = { x: 500, y: 0 }; byKind('term').position = { x: 600, y: 0 };

    // ── plans (the first three are on the calendar; "Send the invoice" has no time yet and is dragged on live) ──
    const items = todo.state.items = [];
    let seq = 0;
    const plan = (id, text, min, when) => {
      seq++;
      const itemId = 'item-' + id;
      items.push({ id: itemId, text, done: false, createdAt: '2026-11-24T07:00:00.000Z', completedAt: null, taskNodeId: id, ...(when ? { scheduledFor: when } : {}) });
      nodes.push({ id, kind: 'todo.task', position: { x: 4000, y: 700 + seq * 220 }, isMother: false, state: {
        text, done: false, durationMin: min, eta: `~${min} min`, sequenceNumber: seq, layer: 0, createdAt: '2026-11-24T07:00:00.000Z',
        parentTodoId: todo.id, parentTaskId: null, todoItemId: itemId, pomoSessionsCompleted: 0, plannedMin: min,
        secondsAccumulated: 0, currentSessionElapsedSec: 0, kind: 'event', ...(when ? { scheduledFor: when, scheduledDurationMin: min } : {}) }, config: { showDuration: true } });
    };
    plan('t-review', 'Review the proposal', 60, at(11, 0));
    plan('t-call', 'Client call', 60, at(14, 0));
    plan('t-gym', 'Gym', 90, at(18, 0));
    plan('t-invoice', 'Send the invoice', 30, null);
    plan('t-milk', 'Buy oat milk', 10, null);
    cal.config = { ...cal.config, view: 'day', hourRange: { start: 0, end: 23 } };
    cal.state = { ...cal.state, zoom: 5 };

    // ── habits with a streak behind them ──
    const day = (back) => { const d = new Date(`${DAY}T12:00:00`); d.setDate(d.getDate() - back); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
    const run = (a, z) => Array.from({ length: z - a + 1 }, (_, i) => day(a + i));
    const created = '2026-10-01T08:00:00.000Z';
    habit.state = { habits: [
      { id: 'h-run', name: 'Morning run', icon: 'run', createdAt: created, log: run(1, 6), archived: false, color: 'acid', schedule: { kind: 'daily', timeOfDay: '07:00', durationMin: 30 } },
      { id: 'h-read', name: 'Read 20 pages', icon: 'book', createdAt: created, log: run(1, 4), archived: false, color: 'cyan' },
      { id: 'h-water', name: 'Drink water', icon: 'water', createdAt: created, log: run(1, 2), archived: false, color: 'rust' },
    ] };

    // ── the notes frame: left of the row, so it never shares a shot with the windows ──
    const FX = -2400, FY = 300, kids = ['n-title', 'n1', 'n2', 'n3'];
    nodes.push({ id: 'frame-notes', kind: 'frame', position: { x: FX, y: FY }, isMother: false, state: { label: 'This week', width: 600, height: 650, childIds: kids }, config: { tint: 'neutral' } });
    const note = (id, text, color, x, y) => nodes.push({ id, kind: 'text', position: { x: FX + x, y: FY + y }, isMother: false, state: { text, look: { kind: 'sticky', color }, width: 250, height: 210 }, config: { fontSize: 22 } });
    nodes.push({ id: 'n-title', kind: 'text', position: { x: FX + 40, y: FY + 56 }, isMother: false, state: { text: 'Pitch week', look: { kind: 'rect', color: '#c9f158' }, width: 520, height: 76 }, config: { fontSize: 26 } });
    note('n1', 'Ask Prof. Meyer about the deadline', '#ffe28a', 40, 160);
    note('n2', 'Pitch deck v2: add the numbers', '#ffb3c7', 310, 160);
    note('n3', '', '#a8e6ff', 40, 380);

    b.edges = [];
    b.layoutMode = 'free';
    return b;
  };
  let k;
  Object.defineProperty(window, 'krnl', { configurable: true, get: () => k, set: (v) => { const orig = v.boardLoad; v.boardLoad = async () => mutate(await orig()); k = v; } });
})();
