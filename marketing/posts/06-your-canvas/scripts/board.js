// Injected before the app: a calm demo canvas for the "your canvas" carousel (illustrative data).
// MODE is set from the page URL hash by capture.cjs via window.__MODE__ ('free' | 'station').
(() => {
  const pad = (n) => String(n).padStart(2, '0');
  const DAY = '2026-11-24';
  const at = (h, m = 0) => `${DAY}T${pad(h)}:${pad(m)}:00`;
  const mutate = (b) => {
    const nodes = b.nodes;
    const byKind = (k) => nodes.find((n) => n.kind === k);
    const place = (n, x, y, w, h) => { n.position = { x, y }; n.config = { ...n.config, canvasSize: { width: w, height: h } }; };
    const todo = byKind('todo'), cal = byKind('calendar'), habit = byKind('habit'), pomo = byKind('pomo');
    place(todo, 0, 0, 440, 400); place(cal, 100, 0, 520, 520); place(habit, 200, 0, 520, 520); place(pomo, 300, 0, 520, 520);
    byKind('clock').position = { x: 400, y: 0 }; byKind('analytics').position = { x: 500, y: 0 }; byKind('term').position = { x: 600, y: 0 };

    for (const n of [cal, habit, pomo, byKind('clock'), byKind('analytics'), byKind('term')]) n.config = { ...n.config, stationHidden: window.__KEEP__ && window.__KEEP__.includes(n.kind) ? false : true };
    const items = todo.state.items = [];
    let seq = 0;
    const plan = (id, text, min, when) => {
      seq++; const itemId = 'item-' + id;
      items.push({ id: itemId, text, done: false, createdAt: '2026-11-24T07:00:00.000Z', completedAt: null, taskNodeId: id, ...(when ? { scheduledFor: when } : {}) });
      nodes.push({ id, kind: 'todo.task', position: { x: 6000, y: 700 + seq * 220 }, isMother: false, state: {
        text, done: false, durationMin: min, eta: `~${min} min`, sequenceNumber: seq, layer: 0, createdAt: '2026-11-24T07:00:00.000Z',
        parentTodoId: todo.id, parentTaskId: null, todoItemId: itemId, pomoSessionsCompleted: 0, plannedMin: min,
        secondsAccumulated: 0, currentSessionElapsedSec: 0, kind: 'event', ...(when ? { scheduledFor: when, scheduledDurationMin: min } : {}) }, config: { showDuration: true } });
    };
    plan('t-review', 'Review the proposal', 60, at(11, 0));
    plan('t-call', 'Client call', 60, at(14, 0));
    plan('t-gym', 'Gym', 90, at(18, 0));
    plan('t-invoice', 'Send the invoice', 30, null);
    cal.config = { ...cal.config, view: 'day', hourRange: { start: 0, end: 23 } };
    cal.state = { ...cal.state, zoom: 5 };

    const day = (back) => { const d = new Date(`${DAY}T12:00:00`); d.setDate(d.getDate() - back); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
    const run = (a, z) => Array.from({ length: z - a + 1 }, (_, i) => day(a + i));
    const created = '2026-10-01T08:00:00.000Z';
    habit.state = { habits: [
      { id: 'h-run', name: 'Morning run', icon: 'run', createdAt: created, log: run(1, 6), archived: false, color: 'acid', schedule: { kind: 'daily', timeOfDay: '07:00', durationMin: 30 } },
      { id: 'h-read', name: 'Read 20 pages', icon: 'book', createdAt: created, log: run(1, 4), archived: false, color: 'cyan' },
    ] };

    // ── things around the Todos window (free canvas). Row of windows starts at x = -1400 (Todos), each 520 + 20 gap ──
    const T = (id, text, look, x, y, w, h, fs = 22) => nodes.push({ id, kind: 'text', position: { x, y }, isMother: false, state: { text, look, width: w, height: h }, config: { fontSize: fs } });
    const S = (c) => ({ kind: 'sticky', color: c });
    const X0 = -940;           // right of the Todos window (440 wide + 20 gap, row starts at -1400)
    T('c-s1', 'Ask Prof. Meyer about the deadline', S('#ffe28a'), X0, 10, 240, 200);
    T('c-s2', 'Pitch deck v2: add the numbers', S('#ffb3c7'), X0, 250, 240, 200);
    T('c-t1', 'call mum on Sunday', { kind: 'ellipse', color: '#b9f5a8' }, X0 + 270, 20, 250, 120, 24);
    T('c-r1', 'Pitch week', { kind: 'rect', color: '#c9f158' }, X0 + 270, 170, 260, 80, 26);
    T('c-s3', 'Gift idea for Mom', S('#a8e6ff'), X0 + 270, 290, 240, 190);
    // a framed group (far below, shot on its own)
    const FX = -1400, FY = 1400, kids = ['f-title', 'f1', 'f2', 'f3'];
    nodes.push({ id: 'frame-notes', kind: 'frame', position: { x: FX, y: FY }, isMother: false, state: { label: 'Pitch week', width: 640, height: 640, childIds: kids }, config: { tint: 'neutral' } });
    T('f-title', 'Friday: pitch to the jury', { kind: 'rect', color: '#c9f158' }, FX + 40, FY + 60, 560, 76, 26);
    T('f1', 'Ask Prof. Meyer about the deadline', S('#ffe28a'), FX + 40, FY + 170, 250, 210);
    T('f2', 'Pitch deck v2: add the numbers', S('#ffb3c7'), FX + 330, FY + 170, 250, 210);
    T('f3', 'Slides: end on the demo', S('#a8e6ff'), FX + 40, FY + 400, 250, 190);
    b.edges = [];
    b.layoutMode = window.__MODE__ === 'station' ? 'station' : 'free';
    return b;
  };
  let k;
  Object.defineProperty(window, 'krnl', { configurable: true, get: () => k, set: (v) => { const orig = v.boardLoad; v.boardLoad = async () => mutate(await orig()); k = v; } });
})();
