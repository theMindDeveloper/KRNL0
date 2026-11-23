// Injected before the app: puts the canvas in Free layout (windows are real canvas nodes we can frame one by one).
(() => {
  let k;
  Object.defineProperty(window, 'krnl', { configurable: true, get: () => k, set: (v) => { const orig = v.boardLoad; v.boardLoad = async () => { const b = await orig(); b.layoutMode = 'free';
      const pomo = b.nodes.find((n) => n.kind === 'pomo'); pomo.position = { x: 0, y: 0 }; pomo.config = { ...pomo.config, canvasSize: { width: 540, height: 540 } }; b.edges = []; return b; }; k = v; } });
})();
