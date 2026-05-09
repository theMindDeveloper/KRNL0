// LifeOS — Whiteboard canvas with pan/zoom, drag, connections

// --- Default board content ---
const INITIAL_NODES = [
  { id: 'n1', kind: 'pomodoro', x: 80,  y: 60,  data: { seconds: 18*60+42, running: true } },
  { id: 'n2', kind: 'todo',     x: 380, y: 40,  data: { title: 'Today' } },
  { id: 'n3', kind: 'habit',    x: 80,  y: 380, data: {} },
  { id: 'n4', kind: 'text',     x: 720, y: 60,  data: { text: 'Today is a system day. Less doing, more shaping. Make the loops cleaner — then everything downstream gets easier.' } },
  { id: 'n5', kind: 'image',    x: 760, y: 280, data: { kind: 'mountain', name: 'morning.ascii' } },
  { id: 'n6', kind: 'terminal', x: 440, y: 380, data: {} },
];
const INITIAL_EDGES = [
  { id: 'e1', from: 'n1', to: 'n2', active: true },
  { id: 'e2', from: 'n2', to: 'n6' },
  { id: 'e3', from: 'n3', to: 'n6' },
  { id: 'e4', from: 'n4', to: 'n5' },
];

// approximate node sizes for edge endpoints — updated from actual rendered sizes
const NODE_SIZE = {
  pomodoro: { w: 240, h: 260 },
  todo:     { w: 280, h: 260 },
  habit:    { w: 320, h: 250 },
  text:     { w: 260, h: 150 },
  image:    { w: 240, h: 210 },
  terminal: { w: 460, h: 360 },
};

function getNodeSize(node) {
  const base = NODE_SIZE[node.kind] || { w: 240, h: 200 };
  return { w: node.w || base.w, h: node.h || base.h };
}

function Whiteboard() {
  const [nodes, setNodes] = useState(INITIAL_NODES);
  const [edges, setEdges] = useState(INITIAL_EDGES);
  const [selected, setSelected] = useState(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [panning, setPanning] = useState(false);
  const [pendingEdge, setPendingEdge] = useState(null); // {from, fromSide, x, y}
  const [tweaksOpen, setTweaksOpen] = useState(false);
  const [tweaks, setTweaks] = useState({ density: 'comfy', accent: 'acid', dots: 'on', theme: 'dark' });
  const [tool, setTool] = useState('select');

  const wrapRef = useRef(null);
  const panState = useRef(null);
  const dragState = useRef(null);
  const resizeState = useRef(null);

  // --- Coordinate helpers ---
  const screenToWorld = useCallback((sx, sy) => {
    const rect = wrapRef.current.getBoundingClientRect();
    return {
      x: (sx - rect.left - view.x) / view.k,
      y: (sy - rect.top - view.y) / view.k,
    };
  }, [view]);

  // --- Pan / zoom ---
  const onWrapMouseDown = (e) => {
    if (e.target.closest('.node') || e.target.closest('.port')) return;
    if (e.button !== 0 && e.button !== 1) return;
    setSelected(null);
    setPanning(true);
    panState.current = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
  };
  useEffect(() => {
    const onMove = (e) => {
      const ps = panState.current;
      if (ps) {
        const dx = e.clientX - ps.sx;
        const dy = e.clientY - ps.sy;
        setView(v => ({ ...v, x: ps.vx + dx, y: ps.vy + dy }));
      }
      const rs = resizeState.current;
      if (rs) {
        const rdx = (e.clientX - rs.sx) / view.k;
        const rdy = (e.clientY - rs.sy) / view.k;
        const newW = Math.max(rs.minW, rs.ow + rdx);
        const newH = Math.max(rs.minH, rs.oh + rdy);
        setNodes(ns => ns.map(n => n.id === rs.id ? { ...n, w: newW, h: newH } : n));
      }
      const ds = dragState.current;
      if (ds) {
        const dx = (e.clientX - ds.sx) / view.k;
        const dy = (e.clientY - ds.sy) / view.k;
        setNodes(ns => ns.map(n => n.id === ds.id ? { ...n, x: ds.nx + dx, y: ds.ny + dy } : n));
      }
      if (pendingEdge) {
        const w = screenToWorld(e.clientX, e.clientY);
        setPendingEdge(p => p ? ({ ...p, x: w.x, y: w.y }) : p);
      }
    };
    const onUp = (e) => {
      if (panState.current) { panState.current = null; setPanning(false); }
      if (resizeState.current) { resizeState.current = null; }
      if (dragState.current) { dragState.current = null; }
      if (pendingEdge) {
        // Try to drop on a port
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const portEl = el?.closest('.port');
        const nodeEl = portEl?.closest('.node');
        if (nodeEl && nodeEl.dataset.id !== pendingEdge.from) {
          setEdges(es => [...es, {
            id: 'e' + Date.now(),
            from: pendingEdge.from,
            to: nodeEl.dataset.id,
          }]);
        }
        setPendingEdge(null);
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [view.k, pendingEdge, screenToWorld]);

  const onWheel = (e) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      // pinch-zoom
      const rect = wrapRef.current.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const factor = Math.exp(-e.deltaY * 0.01);
      const newK = Math.max(0.25, Math.min(2.5, view.k * factor));
      const wx = (cx - view.x) / view.k;
      const wy = (cy - view.y) / view.k;
      setView({ k: newK, x: cx - wx * newK, y: cy - wy * newK });
    } else {
      setView(v => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
    }
  };

  // --- Node drag ---
  const onNodeMouseDown = (e, node) => {
    if (e.target.closest('.port')) return;
    if (e.target.closest('input, textarea, button')) return;
    if (e.target.closest('.resize-handle')) return;
    if (!e.target.closest('[data-drag-handle]')) return;
    e.stopPropagation();
    setSelected(node.id);
    dragState.current = { id: node.id, sx: e.clientX, sy: e.clientY, nx: node.x, ny: node.y };
  };

  // --- Resize ---
  const onResizeDown = (e, node) => {
    e.stopPropagation();
    e.preventDefault();
    const sz = getNodeSize(node);
    const base = NODE_SIZE[node.kind] || { w: 180, h: 160 };
    resizeState.current = {
      id: node.id,
      kind: node.kind,
      sx: e.clientX, sy: e.clientY,
      ow: sz.w, oh: sz.h,
      minW: base.w * 0.6,
      minH: base.h * 0.5,
    };
  };

  // --- Port drag (start connection) ---
  const onPortDown = (e, nodeId, side) => {
    e.stopPropagation();
    e.preventDefault();
    const w = screenToWorld(e.clientX, e.clientY);
    setPendingEdge({ from: nodeId, fromSide: side, x: w.x, y: w.y });
  };

  // --- Edge geometry ---
  const nodeMap = useMemo(() => Object.fromEntries(nodes.map(n => [n.id, n])), [nodes]);
  const edgePath = useCallback((edge) => {
    const a = nodeMap[edge.from];
    const b = nodeMap[edge.to];
    if (!a || !b) return '';
    const aSize = getNodeSize(a);
    const bSize = getNodeSize(b);
    const aRight = a.x + aSize.w;
    const aMidY = a.y + aSize.h / 2;
    const bLeft = b.x;
    const bMidY = b.y + bSize.h / 2;
    let x1, y1, x2, y2;
    if (b.x > a.x + aSize.w / 2) {
      x1 = aRight; y1 = aMidY; x2 = bLeft; y2 = bMidY;
    } else {
      x1 = a.x; y1 = aMidY; x2 = b.x + bSize.w; y2 = bMidY;
    }
    const dx = Math.max(40, Math.abs(x2 - x1) * 0.4);
    const sign = x2 >= x1 ? 1 : -1;
    return `M ${x1} ${y1} C ${x1 + sign*dx} ${y1}, ${x2 - sign*dx} ${y2}, ${x2} ${y2}`;
  }, [nodeMap]);

  // --- Add node from dock ---
  const addNode = (kind) => {
    const id = 'n' + Date.now();
    const center = screenToWorld(window.innerWidth / 2, window.innerHeight / 2);
    setNodes(ns => [...ns, { id, kind, x: center.x - 100, y: center.y - 80, data: {} }]);
    setSelected(id);
  };

  const removeNode = (id) => {
    setNodes(ns => ns.filter(n => n.id !== id));
    setEdges(es => es.filter(e => e.from !== id && e.to !== id));
  };

  // --- Pending edge endpoint (anchored at source port) ---
  const pendingPath = useMemo(() => {
    if (!pendingEdge) return '';
    const a = nodeMap[pendingEdge.from];
    if (!a) return '';
    const aSize = getNodeSize(a);
    const x1 = pendingEdge.fromSide === 'right' ? a.x + aSize.w : a.x;
    const y1 = a.y + aSize.h / 2;
    const x2 = pendingEdge.x; const y2 = pendingEdge.y;
    const dx = Math.max(40, Math.abs(x2 - x1) * 0.4);
    const sign = x2 >= x1 ? 1 : -1;
    return `M ${x1} ${y1} C ${x1 + sign*dx} ${y1}, ${x2 - sign*dx} ${y2}, ${x2} ${y2}`;
  }, [pendingEdge, nodeMap]);

  // Reset / fit
  const fit = () => setView({ x: 60, y: 50, k: 0.85 });

  // Background grid offset
  const bgStyle = {
    backgroundPosition: `${view.x}px ${view.y}px, ${view.x}px ${view.y}px`,
    backgroundSize: `${160 * view.k}px ${160 * view.k}px, ${32 * view.k}px ${32 * view.k}px`,
    opacity: tweaks.dots === 'off' ? 0 : 1,
  };

  // Tweaks: accent color + theme
  useEffect(() => {
    const root = document.documentElement;
    const map = { acid: '#c9f158', cyan: '#4ea8b0', plum: '#b48cf0' };
    root.style.setProperty('--acid', map[tweaks.accent] || '#c9f158');
  }, [tweaks.accent]);
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', tweaks.theme);
  }, [tweaks.theme]);
  const toggleTheme = () => setTweaks(t => ({ ...t, theme: t.theme === 'dark' ? 'light' : 'dark' }));

  return (
    <div className="app">
      {/* Top bar */}
      <div className="topbar">
        <div className="brand">
          <div className="brand-mark">■</div>
          <div className="brand-name">KRNL<span className="dim">0</span></div>
        </div>
        <div className="crumb">
          <span>∷</span>
          <span>~/krnl0</span><span style={{opacity:.4}}>/</span><span>boards</span><span style={{opacity:.4}}>/</span><span style={{color:'var(--ink)'}}>deep-work</span>
          <span style={{opacity:.4}}>·</span>
          <span className="live">◆ live</span>
        </div>
        <div className="topbar-spacer" />
        <div className="top-actions">
          <button className="btn" onClick={fit}>FIT <span className="kbd">⇧F</span></button>
          <button className="btn" onClick={toggleTheme} title="Toggle theme">
            {tweaks.theme === 'dark' ? '☾ DARK' : '☀ LIGHT'}
          </button>
          <button className="btn" onClick={() => setTweaksOpen(o => !o)}>
            TWEAKS
          </button>
          <button className="btn primary">SHARE</button>
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={wrapRef}
        className={`canvas-wrap ${panning ? 'panning' : ''} ${pendingEdge ? 'connecting' : ''}`}
        onMouseDown={onWrapMouseDown}
        onWheel={onWheel}
      >
        <div className="canvas-bg" style={bgStyle} />
        <div className="canvas" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
          <svg className="connections" style={{ overflow: 'visible' }}>
            {edges.map(edge => (
              <path
                key={edge.id}
                d={edgePath(edge)}
                className={edge.active ? 'active' : ''}
              />
            ))}
            {pendingEdge && <path d={pendingPath} className="pending" />}
          </svg>
          {nodes.map(node => (
            <div
              key={node.id}
              data-id={node.id}
              className={`node ${node.kind} ${selected === node.id ? 'selected' : ''}`}
              style={{ left: node.x, top: node.y, width: node.w || undefined, height: node.h || undefined }}
              onMouseDown={(e) => onNodeMouseDown(e, node)}
              onClick={(e) => { e.stopPropagation(); setSelected(node.id); }}
            >
              <NodeBody node={node} onPortDown={onPortDown} />
              {selected === node.id && (
                <div className="resize-handle" onMouseDown={(e) => onResizeDown(e, node)} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Left dock */}
      <div className="dock">
        <button className={`dock-btn ${tool === 'select' ? 'active' : ''}`} data-tip="Select · V" onClick={() => setTool('select')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 3l14 9-7 1-3 7L5 3z"/></svg>
        </button>
        <div className="dock-divider" />
        <button className="dock-btn" data-tip="Pomodoro" onClick={() => addNode('pomodoro')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="13" r="7"/><path d="M12 13V9M9 3h6"/></svg>
        </button>
        <button className="dock-btn" data-tip="Habit grid" onClick={() => addNode('habit')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="6" height="6"/><rect x="15" y="3" width="6" height="6" fill="currentColor"/><rect x="3" y="15" width="6" height="6" fill="currentColor"/><rect x="15" y="15" width="6" height="6"/></svg>
        </button>
        <button className="dock-btn" data-tip="Todo list" onClick={() => addNode('todo')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 6h12M9 12h12M9 18h12M3 6l2 2 2-2M3 12l2 2 2-2M3 18l2 2 2-2"/></svg>
        </button>
        <button className="dock-btn" data-tip="Text note" onClick={() => addNode('text')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 4h14M12 4v16M8 20h8"/></svg>
        </button>
        <button className="dock-btn" data-tip="Image / ASCII" onClick={() => addNode('image')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="16" rx="1"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/></svg>
        </button>
        <button className="dock-btn" data-tip="Terminal · ⌘T" onClick={() => addNode('terminal')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="16" rx="1"/><path d="M7 9l3 3-3 3M13 15h4"/></svg>
        </button>
        <div className="dock-divider" />
        <button className="dock-btn" data-tip="Connect">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="6" cy="12" r="2"/><circle cx="18" cy="12" r="2"/><path d="M8 12h8"/></svg>
        </button>
      </div>

      {/* Tweaks */}
      <div className={`tweaks ${tweaksOpen ? 'open' : ''}`}>
        <div className="tweaks-head">
          <span>tweaks · /board</span>
          <button className="x" onClick={() => setTweaksOpen(false)}>×</button>
        </div>
        <div className="tweaks-body">
          <div className="tweak-row">
            <div className="label">theme</div>
            <div className="opts">
              {['light','dark'].map(t => (
                <button key={t} className={`tweak-opt ${tweaks.theme === t ? 'active' : ''}`}
                  onClick={() => setTweaks(s => ({...s, theme: t}))}>{t}</button>
              ))}
            </div>
          </div>
          <div className="tweak-row">
            <div className="label">accent</div>
            <div className="opts">
              {['acid','cyan','plum'].map(a => (
                <button key={a} className={`tweak-opt ${tweaks.accent === a ? 'active' : ''}`}
                  onClick={() => setTweaks(t => ({...t, accent: a}))}>{a}</button>
              ))}
            </div>
          </div>
          <div className="tweak-row">
            <div className="label">density</div>
            <div className="opts">
              {['compact','comfy','spacious'].map(d => (
                <button key={d} className={`tweak-opt ${tweaks.density === d ? 'active' : ''}`}
                  onClick={() => setTweaks(t => ({...t, density: d}))}>{d}</button>
              ))}
            </div>
          </div>
          <div className="tweak-row">
            <div className="label">grid dots</div>
            <div className="opts">
              {['on','off'].map(d => (
                <button key={d} className={`tweak-opt ${tweaks.dots === d ? 'active' : ''}`}
                  onClick={() => setTweaks(t => ({...t, dots: d}))}>{d}</button>
              ))}
            </div>
          </div>
          <div className="tweak-row">
            <div className="label" style={{ marginTop: 4, color: 'var(--ink-4)', fontSize: 9.5, lineHeight: 1.5 }}>
              drag from any port (●) to connect nodes ·<br/>
              ⌘/ctrl + scroll to zoom · drag canvas to pan
            </div>
          </div>
        </div>
      </div>

      {/* Minimap */}
      <div className="minimap">
        <div className="minimap-label">map</div>
        <div className="minimap-canvas">
          {nodes.map(n => {
            const sz = NODE_SIZE[n.kind];
            return (
              <div key={n.id}
                className={`minimap-node ${n.kind}`}
                style={{
                  left: 100 + n.x * 0.06,
                  top: 30 + n.y * 0.06,
                  width: sz.w * 0.06,
                  height: sz.h * 0.06,
                }}
              />
            );
          })}
        </div>
      </div>

      {/* AI Assistant Blob */}
      <AIBlob />

      {/* Status bar */}
      <div className="statusbar">
        <div className="status-item"><span className="label">workspace</span><span className="val">~/krnl0/deep-work</span></div>
        <div className="status-item acid"><span className="label">claude</span><span className="val">● connected</span></div>
        <div className="status-item rust"><span className="label">pomo</span><span className="val">18:42 / 25:00</span></div>
        <div className="status-item"><span className="label">nodes</span><span className="val">{nodes.length}</span></div>
        <div className="status-item"><span className="label">edges</span><span className="val">{edges.length}</span></div>
        <div className="status-spacer" />
        <div className="status-item"><span className="label">zoom</span><span className="val">{Math.round(view.k * 100)}%</span></div>
        <div className="status-item"><span className="label">v0.1.0</span></div>
      </div>

      <div className="hint">
        <span>drag from <span style={{color:'var(--acid)'}}>●</span> ports to connect</span>
        <span><span className="kbd">⌘</span> + scroll to zoom</span>
        <span>click <span className="kbd">+</span> in dock to add a node</span>
      </div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<Whiteboard />);
