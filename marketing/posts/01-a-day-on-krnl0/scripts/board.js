// Injected before the app. A composed "Tuesday" board: three plans, a calendar day, habits with streaks, a finished day for Analytics.
(() => {
  const pad = n => String(n).padStart(2, '0');
  const iso = (h, m = 0) => `2026-11-24T${pad(h)}:${pad(m)}:00`;
  const mutate = (b) => {
    const nodes = b.nodes; const todo = nodes.find(n => n.kind === 'todo'); const items = todo.state.items = [];
    const SCHED = !!window.__SCHED, DONE = !!window.__DONE;
    let seq = 0;
    const task = (id, text, min, h, m, spent) => {
      seq++; const itemId = 'item-' + id; const done = DONE && spent != null;
      items.push({ id: itemId, text, done, createdAt: '2026-11-24T07:00:00.000Z', completedAt: done ? '2026-11-24T12:00:00.000Z' : null, taskNodeId: id, ...(SCHED && h != null ? { scheduledFor: iso(h, m) } : {}) });
      nodes.push({ id, kind: 'todo.task', position: { x: 4000, y: 700 + seq * 220 }, isMother: false, state: {
        text, done, durationMin: min, eta: `~${min} min`, sequenceNumber: seq, layer: 0, createdAt: '2026-11-24T07:00:00.000Z',
        parentTodoId: todo.id, parentTaskId: null, todoItemId: itemId, pomoSessionsCompleted: 0, plannedMin: min,
        secondsAccumulated: done ? spent * 60 : 0, currentSessionElapsedSec: 0, kind: 'event',
        ...(SCHED && h != null ? { scheduledFor: iso(h, m), scheduledDurationMin: min } : {}), ...(done ? { completedAt: '2026-11-24T12:00:00.000Z' } : {}) }, config: { showDuration: true } });
    };
    task('t-review', 'Review the proposal', 90, 10, 30, 125);
    task('t-call', 'Client call', 60, 13, 0, 70);
    task('t-gym', 'Gym', 60, 15, 0, 65);
    task('t-milk', 'Buy oat milk', 10, null, 0);
    const cal = nodes.find(n => n.kind === 'calendar');
    cal.config = { ...cal.config, view: 'day', hourRange: { start: 9, end: 19 }, canvasSize: { width: 540, height: 760 } };
    cal.state = { ...cal.state, zoom: window.__CALZOOM || 5 };
    const day = back => { const d = new Date('2026-11-24T12:00:00'); d.setDate(d.getDate() - back); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
    const run = (a, z) => Array.from({ length: z - a + 1 }, (_, i) => day(a + i));
    const created = '2026-10-01T08:00:00.000Z';
    const hab = nodes.find(n => n.kind === 'habit');
    hab.state = { habits: [
      { id: 'h-run', name: 'Morning run', icon: 'run', createdAt: created, log: run(0, 12), archived: false, color: 'acid', schedule: { kind: 'daily', timeOfDay: '07:00', durationMin: 30 } },
      { id: 'h-read', name: 'Read 20 pages', icon: 'book', createdAt: created, log: run(0, 5), archived: false, color: 'cyan' },
      { id: 'h-water', name: 'Drink water', icon: 'water', createdAt: created, log: run(0, 3), archived: false, color: 'rust' },
    ] };
    if (window.__DONE) {
      const D = (d, h, m) => new Date(`2026-11-${pad(d)}T${pad(h)}:${pad(m)}:00`);
      const rec = (id, d, h, m, mins, task, label) => { const st = D(d, h, m); return { id, startedAt: st.toISOString(), endedAt: new Date(st.getTime() + mins * 60000).toISOString(), durationMin: mins, label, completed: true, taskId: task, kind: 'work' }; };
      const pomo = nodes.find(n => n.kind === 'pomo');
      pomo.state.history = [
        rec('r2', 24, 10, 30, 125, 't-review', 'Review the proposal'), rec('r3', 24, 13, 0, 70, 't-call', 'Client call'), rec('r4', 24, 15, 0, 65, 't-gym', 'Gym'),
        rec('r5', 23, 9, 0, 110, 'gone-a', 'Write the report'), rec('r6', 23, 14, 0, 80, 'gone-b', 'Prepare the slides'),
        rec('r7', 22, 10, 0, 100, 'gone-c', 'Plan the sprint'), rec('r8', 21, 9, 30, 115, 'gone-d', 'Study chapter 4'), rec('r9', 21, 15, 0, 40, 'gone-e', 'Emails'),
        rec('r10', 20, 10, 0, 105, 'gone-f', 'Design review'), rec('r11', 19, 11, 0, 75, 'gone-g', 'Weekly review'),
      ];
      const plannedOf = { 'gone-a': 120, 'gone-b': 90, 'gone-c': 90, 'gone-d': 120, 'gone-e': 30, 'gone-f': 90, 'gone-g': 60 };
      const todayDone = [['t-review', 'Review the proposal', 90, '12:35'], ['t-call', 'Client call', 60, '14:45'], ['t-gym', 'Gym', 60, '17:10']];
      b.completions = [
        ...todayDone.map(([id, text, p, t]) => ({ taskId: id, text, plannedMin: p, completedAt: `2026-11-24T${t}:00.000Z` })),
        ...Object.entries(plannedOf).map(([id, m]) => ({ taskId: id, text: pomo.state.history.find(h => h.taskId === id).label, plannedMin: m, completedAt: '2026-11-23T18:00:00.000Z' })),
      ];
    }
    const an = nodes.find(n => n.kind === 'analytics');
    if (an) an.state = { ...an.state, view: 'summary', rangeDays: 7 };
    const size = { todo: [540, 330], habit: [540, 420], pomo: [540, 540] };
    for (const n of nodes) if (n.isMother && size[n.kind]) n.config = { ...n.config, canvasSize: { width: size[n.kind][0], height: size[n.kind][1] } };
    b.edges = []; b.layoutMode = 'free';
    return b;
  };
  let k;
  Object.defineProperty(window, 'krnl', { configurable: true, get: () => k, set: v => { const orig = v.boardLoad; v.boardLoad = async () => mutate(await orig()); k = v; } });
})();
