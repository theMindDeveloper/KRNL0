// Injected before the app: a small demo board (Todos, Calendar, Habits, Timer + the Terminal) and a stand-in shell for the
// Terminal window. The preview has no real shell, so the "shell" below echoes what is typed and prints the output that the
// REAL krnl command code produced for the same command (recorded headlessly into outputs.json, see run.test.ts).
(() => {
  const pad = (n) => String(n).padStart(2, '0');
  const DAY = '2026-11-24';
  const at = (h, m = 0) => `${DAY}T${pad(h)}:${pad(m)}:00`;
  const mutate = (b) => {
    const nodes = b.nodes;
    const byKind = (k) => nodes.find((n) => n.kind === k);
    const place = (n, x, y, w, h) => { n.position = { x, y }; n.config = { ...n.config, canvasSize: { width: w, height: h } }; };
    const todo = byKind('todo'), cal = byKind('calendar'), habit = byKind('habit'), pomo = byKind('pomo'), term = byKind('term');
    place(todo, 0, 0, 540, 540); place(cal, 100, 0, 540, 540); place(habit, 200, 0, 540, 540); place(pomo, 300, 0, 540, 540);
    place(term, 400, 0, 540, 540); term.config = { ...term.config, stationHidden: false, fontSize: 12 };
    byKind('clock').position = { x: 500, y: 0 }; byKind('analytics').position = { x: 600, y: 0 };

    const items = todo.state.items = [];
    const plan = (id, text, min, when) => {
      const itemId = 'item-' + id;
      items.push({ id: itemId, text, done: false, createdAt: '2026-11-24T07:00:00.000Z', completedAt: null, taskNodeId: id, ...(when ? { scheduledFor: when } : {}) });
      nodes.push({ id, kind: 'todo.task', position: { x: 4000, y: 900 }, isMother: false, state: {
        text, done: false, durationMin: min, eta: `~${min} min`, sequenceNumber: 1, layer: 0, createdAt: '2026-11-24T07:00:00.000Z',
        parentTodoId: todo.id, parentTaskId: null, todoItemId: itemId, pomoSessionsCompleted: 0, plannedMin: min,
        secondsAccumulated: 0, currentSessionElapsedSec: 0, kind: 'event', ...(when ? { scheduledFor: when, scheduledDurationMin: min } : {}) }, config: { showDuration: true } });
    };
    // the plan the Terminal "adds" is in place before the Todos/Calendar shots (those are the result of that command)
    if (new URLSearchParams(location.search).get('plan') !== '0') plan('t-review', 'Review the proposal', 60, at(11, 0));
    cal.config = { ...cal.config, view: 'day', hourRange: { start: 0, end: 23 } };
    cal.state = { ...cal.state, zoom: 5 };

    const day = (back) => { const d = new Date(`${DAY}T12:00:00`); d.setDate(d.getDate() - back); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
    const run = (a, z) => Array.from({ length: z - a + 1 }, (_, i) => day(a + i));
    habit.state = { habits: [
      { id: 'h-run', name: 'Morning run', icon: 'run', createdAt: '2026-10-01T08:00:00.000Z', log: run(1, 6), archived: false, color: 'acid', schedule: { kind: 'daily', timeOfDay: '07:00', durationMin: 30 } },
    ] };
    b.edges = []; b.layoutMode = 'free';
    return b;
  };

  // ── the stand-in shell ──
  const PROMPT = '\x1b[38;2;201;241;88m❯\x1b[0m ';
  const state = { cb: null, buf: '' };
  window.__OUT = {};
  const run = (cmd) => {
    if (cmd === 'clear') return '\x1b[2J\x1b[H' + PROMPT;
    const out = window.__OUT[cmd];
    return '\r\n' + (out === undefined ? `krnl: no recorded output for: ${cmd}` : out.replace(/\n/g, '\r\n')) + '\r\n' + PROMPT;
  };
  const patch = (v) => {
    v.ptyCreate = async () => ({ sessionId: 'film', motd: '' });
    v.onPtyData = (_id, cb) => { state.cb = cb; setTimeout(() => cb(PROMPT), 50); return () => {}; };
    v.ptyWrite = (_id, data) => {
      for (const ch of data) {
        if (ch === '\r') { const c = state.buf.trim(); state.buf = ''; state.cb && state.cb(c === 'clear' ? run(c) : run(c)); }
        else if (ch === '\x7f') { if (state.buf) { state.buf = state.buf.slice(0, -1); state.cb && state.cb('\b \b'); } }
        else if (ch >= ' ') { state.buf += ch; state.cb && state.cb(ch); }
      }
    };
  };
  let k;
  Object.defineProperty(window, 'krnl', { configurable: true, get: () => k, set: (v) => { const orig = v.boardLoad; v.boardLoad = async () => mutate(await orig()); patch(v); k = v; } });
})();
