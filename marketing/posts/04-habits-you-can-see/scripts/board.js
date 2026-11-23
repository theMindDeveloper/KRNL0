// Demo board for the Habits post: only the Habits window matters; the rest is hidden by the capture script.
// window.__V picks the data variant: 'week' (default), 'repair' (yesterday missed), 'year' (long history), 'empty' (no habits).
(() => {
  const pad = (n) => String(n).padStart(2, '0');
  const DAY = '2026-11-24';
  const ds = (back) => { const d = new Date(`${DAY}T12:00:00`); d.setDate(d.getDate() - back); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const run = (a, z) => Array.from({ length: z - a + 1 }, (_, i) => ds(a + i));
  // deterministic "mostly yes" history: every ~6th day missed, a little drift
  const hist = (n, miss, seed = 3) => { const out = []; let s = seed; for (let b = 1; b <= n; b++) { s = (s * 1103515245 + 12345) & 0x7fffffff; if ((s >> 8) % 100 >= miss) out.push(ds(b)); } return out; };
  const mutate = (b) => {
    const V = window.__V || 'week';
    const habit = b.nodes.find((n) => n.kind === 'habit');
    habit.position = { x: 0, y: 0 };
    habit.config = { ...habit.config, view: V === 'year' ? 'year' : V === 'month' ? 'month' : 'week', canvasSize: { width: 540, height: 540 } };
    const created = '2026-01-04T08:00:00.000Z';
    const mk = (id, name, icon, color, log, extra = {}) => ({ id, name, icon, createdAt: created, log, archived: false, color, ...extra });
    const sched = { schedule: { kind: 'daily', timeOfDay: '07:00', durationMin: 30 } };
    const rows = (runLog, readLog, waterLog, stretchLog, journalLog) => [
      mk('h-run', 'Morning run', 'run', 'acid', runLog, sched),
      mk('h-read', 'Read 20 pages', 'book', 'cyan', readLog),
      mk('h-water', 'Drink water', 'water', 'rust', waterLog),
      ...(stretchLog ? [mk('h-stretch', 'Stretch', 'run', 'plum', stretchLog)] : []),
      ...(journalLog ? [mk('h-journal', 'Evening journal', 'book', 'ink', journalLog)] : []),
    ];
    if (V === 'empty') habit.state = { habits: [] };
    else if (V === 'repair') habit.state = { habits: rows(run(2, 9), run(1, 4), run(1, 2), run(1, 3), null) };
    else if (V === 'month') habit.state = { habits: rows(
      [...run(1, 6), ds(8), ds(9), ds(10), ds(12), ds(13), ds(15), ds(16), ds(17), ds(18), ds(19), ds(20), ds(21), ds(22)],
      [...run(1, 4), ds(6), ds(7), ds(9), ds(10), ds(11), ds(13), ds(14), ds(17), ds(18), ds(19), ds(21), ds(22), ds(23)],
      [...run(1, 2), ds(4), ds(5), ds(7), ds(8), ds(9), ds(11), ds(12), ds(15), ds(16), ds(20), ds(21), ds(22)],
      [ds(1), ds(3), ds(4), ds(6), ds(8), ds(10), ds(11), ds(14), ds(16), ds(17), ds(21), ds(22)], null) };
    else if (V === 'year') habit.state = { habits: [
      mk('h-run', 'Morning run', 'run', 'acid', [...hist(330, 14, 3).filter((d) => d < ds(39)), ...run(1, 38)]),
      mk('h-read', 'Read 20 pages', 'book', 'cyan', [...hist(240, 26, 11).filter((d) => d < ds(13)), ...run(1, 12)]),
      mk('h-water', 'Drink water', 'water', 'rust', hist(290, 22, 29)),
    ] };
    else habit.state = { habits: rows(run(1, 6), run(1, 4), run(1, 2), run(1, 3), run(1, 12)) };
    b.edges = [];
    b.layoutMode = 'free';
    return b;
  };
  let k;
  Object.defineProperty(window, 'krnl', { configurable: true, get: () => k, set: (v) => { const orig = v.boardLoad; v.boardLoad = async () => mutate(await orig()); k = v; } });
})();
