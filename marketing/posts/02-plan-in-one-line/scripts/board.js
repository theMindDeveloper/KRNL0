// Injected before the app (window.krnl wrapper): a calm demo board for "Plan your day in one line".
// Only Todos + Calendar are shown. The plan typed live ("Review the proposal 11:00 1h") is NOT on the board yet.
(() => {
  const pad = (n) => String(n).padStart(2, '0');
  const DAY = '2026-11-24';
  const at = (h, m = 0) => `${DAY}T${pad(h)}:${pad(m)}:00`;
  const mutate = (b) => {
    const nodes = b.nodes;
    const byKind = (k) => nodes.find((n) => n.kind === k);
    const place = (n, x, y, w, h) => { n.position = { x, y }; n.config = { ...n.config, canvasSize: { width: w, height: h } }; };
    const todo = byKind('todo'), cal = byKind('calendar');
    place(todo, 0, 0, 540, 560); place(cal, 100, 0, 540, 560);
    // everything else is parked far away (and hidden by CSS in the capture)
    byKind('habit').position = { x: 4000, y: 0 }; byKind('pomo').position = { x: 4100, y: 0 };
    byKind('clock').position = { x: 4200, y: 0 }; byKind('analytics').position = { x: 4300, y: 0 }; byKind('term').position = { x: 4400, y: 0 };

    const items = todo.state.items = [];
    let seq = 0;
    const plan = (id, text, min, when) => {
      seq++;
      const itemId = 'item-' + id;
      items.push({ id: itemId, text, done: false, createdAt: `${DAY}T07:00:00.000Z`, completedAt: null, taskNodeId: id, ...(when ? { scheduledFor: when } : {}) });
      nodes.push({ id, kind: 'todo.task', position: { x: 6000, y: 700 + seq * 220 }, isMother: false, state: {
        text, done: false, durationMin: min, eta: `~${min} min`, sequenceNumber: seq, layer: 0, createdAt: `${DAY}T07:00:00.000Z`,
        parentTodoId: todo.id, parentTaskId: null, todoItemId: itemId, pomoSessionsCompleted: 0, plannedMin: min,
        secondsAccumulated: 0, currentSessionElapsedSec: 0, kind: 'event', ...(when ? { scheduledFor: when, scheduledDurationMin: min } : {}) }, config: { showDuration: true } });
    };
    if (window.__REVIEW) plan('t-review', 'Review the proposal', 60, at(11, 0));
    plan('t-call', 'Client call', 60, at(14, 0));
    plan('t-gym', 'Gym', 90, at(18, 0));
    plan('t-invoice', 'Send the invoice', 30, null);
    plan('t-milk', 'Buy oat milk', 10, null);
    cal.config = { ...cal.config, view: 'day', hourRange: { start: 9, end: 17 } };
    cal.state = { ...cal.state, zoom: window.__ZOOM || 6 };
    b.edges = []; b.layoutMode = 'free';
    return b;
  };
  let k;
  Object.defineProperty(window, 'krnl', { configurable: true, get: () => k, set: (v) => { const orig = v.boardLoad; v.boardLoad = async () => mutate(await orig()); k = v; } });
})();
