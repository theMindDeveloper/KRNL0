// Injected before the app: wraps the preview bridge's boardLoad with a marketing board.
(() => {
  const LOGO = window.__LOGO;
  const pad = n => String(n).padStart(2, '0');
  const iso = (h, m = 0) => `2026-11-23T${pad(h)}:${pad(m)}:00`;
  const mutate = (b) => {
    const nodes = b.nodes; const todo = nodes.find(n => n.kind === 'todo'); const items = todo.state.items = [];
    let seq = 0;
    const task = (id, text, min, h, m, extra = {}, pos) => {
      seq++; const itemId = 'item-' + id;
      items.push({ id: itemId, text, done: !!extra.done, createdAt: '2026-11-23T07:00:00.000Z', completedAt: extra.done ? '2026-11-23T09:40:00.000Z' : null, taskNodeId: id, ...(h != null ? { scheduledFor: iso(h, m) } : {}), ...(extra.tag ? { tag: extra.tag } : {}) });
      nodes.push({ id, kind: 'todo.task', position: pos, isMother: false, state: {
        text, done: !!extra.done, durationMin: min, eta: `~${min} min`, sequenceNumber: seq, layer: 0, createdAt: '2026-11-23T07:00:00.000Z',
        parentTodoId: todo.id, parentTaskId: null, todoItemId: itemId, pomoSessionsCompleted: 0, plannedMin: min,
        secondsAccumulated: extra.spent ?? 0, currentSessionElapsedSec: 0, kind: 'event',
        ...(h != null ? { scheduledFor: iso(h, m), scheduledDurationMin: min } : {}), ...(extra.tag ? { tag: extra.tag } : {}),
        ...(extra.done ? { completedAt: '2026-11-23T09:40:00.000Z' } : {}) }, config: { showDuration: true } });
    };
    const Y = 1800;
    task('t-deep', 'Deep work: thesis', 90, 8, 0, { done: true, spent: 5400, tag: 'study' }, { x: 0, y: Y });
    task('t-review', 'Review the proposal', 60, 11, 0, { tag: 'work' }, { x: 300, y: Y });
    task('t-call', 'Client call', 60, 14, 0, { tag: 'work' }, { x: 600, y: Y });
    task('t-gym', 'Gym', 90, 18, 0, { tag: 'health' }, { x: 900, y: Y });
    const cal = nodes.find(n => n.kind === 'calendar');
    cal.config = { ...cal.config, view: 'day', hourRange: { start: 7, end: 21 } };
    cal.state = { ...cal.state, zoom: 4 };
    const hab = nodes.find(n => n.kind === 'habit');
    const day = back => { const d = new Date('2026-11-23T12:00:00'); d.setDate(d.getDate() - back); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
    const run = (a, z) => Array.from({ length: z - a + 1 }, (_, i) => day(a + i));
    const created = '2026-10-01T08:00:00.000Z';
    hab.state = { habits: [
      { id: 'h-run', name: 'Morning run', icon: 'run', createdAt: created, log: run(1, 12), archived: false, color: 'acid', schedule: { kind: 'daily', timeOfDay: '07:00', durationMin: 30 } },
      { id: 'h-read', name: 'Read 20 pages', icon: 'book', createdAt: created, log: run(1, 5), archived: false, color: 'cyan' },
      { id: 'h-water', name: 'Drink water', icon: 'water', createdAt: created, log: run(1, 3), archived: false, color: 'rust' },
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
    b.layoutMode = 'free'; if (window.__VP) b.viewport = window.__VP;
    return b;
  };
  new MutationObserver(() => { for (const i of document.querySelectorAll('img[src^="krnl-asset://"]')) i.src = LOGO; }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] });
  let k;
  Object.defineProperty(window, 'krnl', { configurable: true, get: () => k, set: v => { const orig = v.boardLoad; v.boardLoad = async () => mutate(await orig()); k = v; } });
})();
