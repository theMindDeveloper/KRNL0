// Injected before the app: wraps the preview bridge's boardLoad with a marketing board.
(() => {
  const LOGO = window.__LOGO;
  const pad = n => String(n).padStart(2, '0');
  const iso = (h, m = 0) => `2026-11-24T${pad(h)}:${pad(m)}:00`;
  const mutate = (b) => {
    if (b.__mk) return b; b.__mk = true;   // boardLoad can be called more than once on the same object
    const nodes = b.nodes; const todo = nodes.find(n => n.kind === 'todo'); const items = todo.state.items = [];
    let seq = 0;
    const SKIP = window.__SKIP || '';
    const task = (id, text, min, h, m, extra = {}, pos) => {
      if (id === SKIP) return;
      seq++; const itemId = 'item-' + id;
      items.push({ id: itemId, text, done: !!extra.done, createdAt: '2026-11-24T07:00:00.000Z', completedAt: extra.done ? '2026-11-24T09:40:00.000Z' : null, taskNodeId: id, ...(h != null ? { scheduledFor: iso(h, m) } : {}), ...(extra.tag ? { tag: extra.tag } : {}) });
      nodes.push({ id, kind: 'todo.task', position: pos, isMother: false, state: {
        text, done: !!extra.done, durationMin: min, eta: `~${min} min`, sequenceNumber: seq, layer: 0, createdAt: '2026-11-24T07:00:00.000Z',
        parentTodoId: todo.id, parentTaskId: null, todoItemId: itemId, pomoSessionsCompleted: 0, plannedMin: min,
        secondsAccumulated: extra.spent ?? 0, currentSessionElapsedSec: 0, kind: 'event',
        ...(h != null ? { scheduledFor: iso(h, m), scheduledDurationMin: min } : {}), ...(extra.tag ? { tag: extra.tag } : {}),
        ...(extra.done ? { completedAt: '2026-11-24T09:40:00.000Z' } : {}) }, config: { showDuration: true } });
    };
    const Y = 1800;
    task('t-deep', 'Deep work: thesis', 90, 8, 0, { done: true, spent: 5400, tag: 'study' }, { x: 0, y: Y });
    task('t-review', 'Review the proposal', 60, 11, 0, { tag: 'work' }, { x: 300, y: Y });
    task('t-call', 'Client call', 60, 14, 0, { tag: 'work' }, { x: 600, y: Y });
    task('t-gym', 'Gym', 90, 18, 0, { tag: 'health' }, { x: 900, y: Y });
    task('t-dinner', 'Dinner with Sam', 60, 20, 0, { tag: 'social' }, { x: 1200, y: Y });
    task('t-read', 'Read before bed', 30, 21, 30, { tag: 'study' }, { x: 1500, y: Y });
    const cal = nodes.find(n => n.kind === 'calendar');
    cal.config = { ...cal.config, view: 'day', hourRange: { start: 13, end: 20 }, canvasSize: { width: 540, height: 720 } };
    cal.state = { ...cal.state, zoom: 6 };
    const hab = nodes.find(n => n.kind === 'habit');
    const day = back => { const d = new Date('2026-11-24T12:00:00'); d.setDate(d.getDate() - back); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
    const run = (a, z) => Array.from({ length: z - a + 1 }, (_, i) => day(a + i));
    const created = '2026-10-01T08:00:00.000Z';
    hab.state = { habits: [
      { id: 'h-run', name: 'Morning run', icon: 'run', createdAt: created, log: run(1, 12), archived: false, color: 'acid', schedule: { kind: 'daily', timeOfDay: '07:00', durationMin: 30 } },
      { id: 'h-read', name: 'Read 20 pages', icon: 'book', createdAt: created, log: run(1, 5), archived: false, color: 'cyan' },
      { id: 'h-water', name: 'Drink water', icon: 'water', createdAt: created, log: run(1, 3), archived: false, color: 'rust' },
      { id: 'h-med', name: 'Meditate', icon: 'meditate', createdAt: created, log: run(1, 8), archived: false, color: 'cyan' },
      { id: 'h-sugar', name: 'No sugar', icon: 'food', createdAt: created, log: run(1, 2), archived: false, color: 'acid' },
    ] };
    // Canvas: a launch frame with the logo and sticky notes.
    const FX = 0, FY = 2040;
    const kids = ['img-logo', 's1', 's2', 's3', 's4'];
    nodes.push({ id: 'frame-launch', kind: 'frame', position: { x: FX, y: FY }, isMother: false, state: { label: 'KRNL0 launch week', width: 1120, height: 690, childIds: kids }, config: { tint: 'neutral' } });
    nodes.push({ id: 'img-logo', kind: 'image', position: { x: FX + 40, y: FY + 50 }, isMother: false, state: { assetId: 'logo',  naturalWidth: 1080, naturalHeight: 1080, mimeType: 'image/png', width: 460, height: 460 }, config: { width: 460 } });
    const st = (id, text, color, x, y) => nodes.push({ id, kind: 'text', position: { x: FX + x, y: FY + y }, isMother: false, state: { text, look: { kind: 'sticky', color }, width: 230, height: 200 }, config: { fontSize: 20 } });
    nodes.push({ id: 'title', kind: 'text', position: { x: FX + 560, y: FY + 50 }, isMother: false, state: { text: 'Ship the reel', look: { kind: 'rect', color: '#c9f158' }, width: 500, height: 80 }, config: { fontSize: 24 } });
    st('s1', 'Record the demo on Thursday.', '#ffe28a', 560, 170);
    st('s2', 'Voiceover: one calm take.', '#ffb3c7', 830, 170);
    st('s3', 'Post at 18:00, then reply to everyone.', '#a8e6ff', 560, 420);
    st('s4', 'Then plan the next one.', '#d9c2ff', 830, 420);
    b.edges = [{ id: 'e1', from: { nodeId: 't-review', event: 'task.next' }, to: { nodeId: 't-call', command: 'task.activate' }, enabled: true },
               { id: 'e2', from: { nodeId: 't-call', event: 'task.next' }, to: { nodeId: 't-gym', command: 'task.activate' }, enabled: true }];
    if (!window.__NOSEED) {
    // Recorded time (the timer's history), so Analytics can set planned against spent.
    const D = (day, h, m) => new Date(`2026-11-${pad(day)}T${pad(h)}:${pad(m)}:00`);
    const rec = (id, day, h, m, mins, task, label, kind = 'work') => { const st = D(day, h, m); return { id, startedAt: st.toISOString(), endedAt: new Date(st.getTime() + mins * 60000).toISOString(), durationMin: mins, label, completed: kind === 'work', taskId: task, kind }; };
    const pomo = nodes.find(n => n.kind === 'pomo');
    // Today's four tasks (planned → really took) and earlier days, each tied to a finished plan.
    pomo.state.history = [
      rec('r2', 24, 9, 30, 125, 't-review', 'Review the proposal'),
      rec('r1', 24, 11, 40, 130, 't-deep', 'Deep work: thesis'),
      rec('r3', 24, 14, 0, 80, 't-call', 'Client call'),
      rec('r4', 24, 18, 0, 100, 't-gym', 'Gym'),
      rec('r5', 23, 9, 0, 110, 'gone-a', 'Write the report'), rec('r6', 23, 14, 0, 80, 'gone-b', 'Prepare the slides'),
      rec('r7', 22, 10, 0, 100, 'gone-c', 'Plan the sprint'), rec('r8', 21, 9, 30, 115, 'gone-d', 'Study chapter 4'), rec('r9', 21, 15, 0, 40, 'gone-e', 'Emails'),
      rec('r10', 20, 10, 0, 105, 'gone-f', 'Design review'), rec('r11', 19, 11, 0, 75, 'gone-g', 'Weekly review'),
    ];
    // earlier days (Mon 16 - Sat 21 Nov) so a full week can be looked back on
    const more = [
      rec('q1', 16, 9, 0, 120, 'gone-h', 'Write the outline'), rec('q2', 16, 14, 0, 55, 'gone-i', 'Emails and admin'),
      rec('q3', 17, 9, 30, 95, 'gone-j', 'Draft chapter 2'), rec('q4', 17, 15, 0, 75, 'gone-k', 'Team sync prep'),
      rec('q5', 18, 10, 0, 135, 'gone-l', 'Build the prototype'), rec('q6', 18, 16, 0, 60, 'gone-m', 'Review notes'),
      rec('q7', 20, 9, 0, 90, 'gone-n', 'Plan next week'), rec('q8', 21, 11, 0, 45, 'gone-o', 'Tidy the notes'),
    ];
    pomo.state.history.push(...more);
    const done = { 't-review': 125, 't-deep': 130, 't-call': 80, 't-gym': 100 };
    const t = { 't-review': '10:20', 't-deep': '13:35', 't-call': '15:15', 't-gym': '19:40' };
    for (const n of nodes) if (done[n.id]) { n.state.done = true; n.state.completedAt = `2026-11-24T${t[n.id]}:00.000Z`; n.state.secondsAccumulated = done[n.id] * 60; }
    for (const it of items) if (done[it.taskNodeId]) { it.done = true; it.completedAt = `2026-11-24T${t[it.taskNodeId.replace('item-', '')] || '12:00'}:00.000Z`; }
    // earlier tasks: planned about two thirds of what they really took (the usual story)
    const plannedOf = Object.fromEntries(pomo.state.history.filter(h => String(h.taskId).startsWith('gone-')).map(h => [h.taskId, Math.max(15, Math.round(h.durationMin / 1.5 / 15) * 15)]));
    b.completions = [
      ...Object.keys(done).map((id) => { const n = nodes.find(x => x.id === id); return { taskId: id, text: n.state.text, plannedMin: n.state.plannedMin, completedAt: n.state.completedAt }; }),
      ...Object.entries(plannedOf).map(([id, m]) => ({ taskId: id, text: pomo.state.history.find(h => h.taskId === id).label, plannedMin: m, completedAt: pomo.state.history.find(h => h.taskId === id).endedAt })),
    ];
    }
    const an = nodes.find(n => n.kind === 'analytics');
    if (an) an.state = { ...an.state, view: window.__VIEW || 'estimates', rangeDays: 7 };
    // Windows sized to what they show, so every shot is the whole window with nothing empty.
    const size = Object.assign({ todo: [540, 540], habit: [540, 540], pomo: [540, 540] }, window.__SIZE || {});
    for (const n of nodes) if (n.isMother && size[n.kind]) n.config = { ...n.config, canvasSize: { width: size[n.kind][0], height: size[n.kind][1] } };
    b.layoutMode = 'free'; if (window.__VP) b.viewport = window.__VP;
    return b;
  };
  new MutationObserver(() => { for (const i of document.querySelectorAll('img[src^="krnl-asset://"]')) i.src = LOGO; }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] });
  let k;
  Object.defineProperty(window, 'krnl', { configurable: true, get: () => k, set: v => { const orig = v.boardLoad; v.boardLoad = async () => mutate(await orig()); k = v; } });
})();
