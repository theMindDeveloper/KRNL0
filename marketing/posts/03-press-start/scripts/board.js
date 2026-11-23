// Injected before the app: a small "Tuesday" board for the focus-timer post.
(() => {
  const pad = n => String(n).padStart(2, '0');
  const iso = (h, m = 0) => `2026-11-24T${pad(h)}:${pad(m)}:00`;
  const mutate = (b) => {
    const nodes = b.nodes; const todo = nodes.find(n => n.kind === 'todo'); const items = todo.state.items = [];
    let seq = 0;
    const task = (id, text, min, h, m, extra = {}, pos) => {
      seq++; const itemId = 'item-' + id;
      items.push({ id: itemId, text, done: false, createdAt: '2026-11-24T07:00:00.000Z', completedAt: null, taskNodeId: id, ...(h != null ? { scheduledFor: iso(h, m) } : {}), ...(extra.tag ? { tag: extra.tag } : {}) });
      nodes.push({ id, kind: 'todo.task', position: pos, isMother: false, state: {
        text, done: false, durationMin: min, eta: `~${min} min`, sequenceNumber: seq, layer: 0, createdAt: '2026-11-24T07:00:00.000Z',
        parentTodoId: todo.id, parentTaskId: null, todoItemId: itemId, pomoSessionsCompleted: 0, plannedMin: min,
        secondsAccumulated: 0, currentSessionElapsedSec: 0, kind: 'event',
        ...(h != null ? { scheduledFor: iso(h, m), scheduledDurationMin: min } : {}), ...(extra.tag ? { tag: extra.tag } : {}) }, config: { showDuration: true } });
    };
    const Y = 3000;
    task('t-review', 'Review the proposal', 60, 11, 0, { tag: 'work' }, { x: 0, y: Y });
    task('t-call', 'Client call', 60, 14, 0, { tag: 'work' }, { x: 300, y: Y });
    task('t-gym', 'Gym', 90, 18, 0, { tag: 'health' }, { x: 600, y: Y });
    task('t-mail', 'Answer emails', 30, null, 0, { tag: 'work' }, { x: 900, y: Y });
    const cal = nodes.find(n => n.kind === 'calendar');
    cal.config = { ...cal.config, view: 'day', hourRange: { start: 9, end: 15 }, canvasSize: { width: 540, height: 600 } };
    cal.state = { ...cal.state, zoom: 9 };
    const size = { todo: [540, 540], habit: [540, 540], pomo: [540, 540] };
    for (const n of nodes) if (n.isMother && size[n.kind]) n.config = { ...n.config, canvasSize: { width: size[n.kind][0], height: size[n.kind][1] } };
    b.edges = []; b.layoutMode = 'free';
    return b;
  };
  let k;
  Object.defineProperty(window, 'krnl', { configurable: true, get: () => k, set: v => { const orig = v.boardLoad; v.boardLoad = async () => mutate(await orig()); k = v; } });
})();
