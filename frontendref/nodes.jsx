// LifeOS — Node components
// Each node renders its own body. All accept {node, selected, onPortDown}.

const { useState, useEffect, useRef, useMemo, useCallback } = React;

// --- Shared bits ---
function NodeHead({ kind, title, dotColor, onClose }) {
  return (
    <div className="node-head" data-drag-handle>
      <span className="dot" style={{ background: dotColor }} />
      <span className="title">{title}</span>
      <span style={{ color: 'var(--ink-4)', marginLeft: 4 }}>{kind}</span>
      <div className="actions">
        <button title="More">⋯</button>
        <button title="Delete" onClick={onClose}>×</button>
      </div>
    </div>
  );
}

function Ports({ onPortDown, nodeId }) {
  return (
    <>
      <div className="port left" onMouseDown={(e) => onPortDown(e, nodeId, 'left')} />
      <div className="port right" onMouseDown={(e) => onPortDown(e, nodeId, 'right')} />
    </>
  );
}

// --- POMODORO ---
function PomodoroNode({ node, onPortDown }) {
  const [seconds, setSeconds] = useState(node.data?.seconds ?? 18 * 60 + 42);
  const [running, setRunning] = useState(node.data?.running ?? true);
  const total = 25 * 60;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setSeconds(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [running]);

  const m = String(Math.floor(seconds / 60)).padStart(2, '0');
  const s = String(seconds % 60).padStart(2, '0');
  const pct = ((total - seconds) / total) * 100;

  return (
    <>
      <NodeHead kind="pomo.025" title="Deep Work" dotColor="var(--rust)" />
      <div className="pomo-body">
        <div className="pomo-clock">
          {m}<span className="colon">:</span>{s}
        </div>
        <div className="pomo-bar"><div className="fill" style={{ width: pct + '%' }} /></div>
        <div className="pomo-meta">
          <span>SESSION <span className="session">3 / 4</span></span>
          <span>{running ? '● RUN' : '○ PAUSE'}</span>
        </div>
        <div className="pomo-controls">
          <button className="pomo-btn ghost" onClick={() => setSeconds(25 * 60)}>RESET</button>
          <button className="pomo-btn" onClick={() => setRunning(r => !r)}>
            {running ? 'PAUSE' : 'START'}
          </button>
        </div>
      </div>
      <Ports onPortDown={onPortDown} nodeId={node.id} />
    </>
  );
}

// --- HABIT TRACKER ---
function HabitNode({ node, onPortDown }) {
  const [habits, setHabits] = useState(node.data?.habits ?? [
    { name: 'Morning pages', glyph: '✎', days: [1,1,1,0,1,1,1], streak: 12 },
    { name: 'Run / move 30m', glyph: '↗', days: [1,0,1,1,1,0,1], streak: 4 },
    { name: 'No phone before 9', glyph: '◍', days: [1,1,1,1,1,1,0], streak: 23 },
    { name: 'Read 20 pages', glyph: '⌬', days: [0,1,1,1,0,1,1], streak: 7 },
  ]);

  const toggle = (hi, di) => setHabits(h => h.map((row, i) =>
    i === hi ? { ...row, days: row.days.map((d, j) => j === di ? (d ? 0 : 1) : d) } : row
  ));

  return (
    <>
      <NodeHead kind="hbt.week" title="Habits — week 16" dotColor="var(--acid)" />
      <div className="habit-body">
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
          <div className="habit-week-labels">
            <span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span>
          </div>
        </div>
        {habits.map((h, hi) => (
          <div className="habit-row" key={hi}>
            <div>
              <div className="habit-name">
                <span className="glyph">{h.glyph}</span>
                {h.name}
              </div>
              <div className="habit-streak">▲ {h.streak} day streak</div>
            </div>
            <div className="habit-grid">
              {h.days.map((d, di) => (
                <div
                  key={di}
                  className={`habit-cell ${d ? 'done' : ''} ${di === 6 ? 'today' : ''}`}
                  onClick={() => toggle(hi, di)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <Ports onPortDown={onPortDown} nodeId={node.id} />
    </>
  );
}

// --- TODO ---
function TodoNode({ node, onPortDown }) {
  const [items, setItems] = useState(node.data?.items ?? [
    { text: 'Ship LifeOS v0.4 changelog', tag: 'work', done: false },
    { text: 'Plan Q2 quarterly review', tag: 'work', done: false },
    { text: 'Reply to Marta about the cabin', tag: 'life', done: true },
    { text: 'Order replacement French press', tag: 'home', done: true },
    { text: 'Read "Designing Data-Intensive Apps" ch.4', tag: 'read', done: false },
  ]);
  const toggle = (i) => setItems(it => it.map((x, j) => j === i ? { ...x, done: !x.done } : x));

  return (
    <>
      <NodeHead kind="td.list" title={node.data?.title || 'Today'} dotColor="var(--ink)" />
      <div className="todo-body">
        {items.map((it, i) => (
          <div key={i} className={`todo-item ${it.done ? 'done' : ''}`} onClick={() => toggle(i)}>
            <div className="todo-check" />
            <span className="todo-text">{it.text}</span>
            <span className="todo-tag">{it.tag}</span>
          </div>
        ))}
        <div className="todo-add">+ add task</div>
      </div>
      <Ports onPortDown={onPortDown} nodeId={node.id} />
    </>
  );
}

// --- TEXT ---
function TextNode({ node, onPortDown }) {
  return (
    <>
      <NodeHead kind="txt" title="note" dotColor="var(--ink-4)" />
      <div className="text-body" data-drag-handle>{node.data?.text}</div>
      <Ports onPortDown={onPortDown} nodeId={node.id} />
    </>
  );
}

// --- IMAGE (ASCII) ---
const ASCII_IMAGES = {
  mountain: `       /\\
      /  \\        /\\
     /    \\      /  \\
    /      \\    /    \\___
   /   /\\   \\__/         \\
  /   /  \\                \\
 /___/    \\________________\\
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~`,
  city: `      ▒▒    ░░    ▒▒
   ░░ ██ ░░ ██ ░░ ██ ░░
   ██ ██ ██ ██ ██ ██ ██
   ██ ██ ██ ██ ██ ██ ██
░░ ██ ██ ██ ██ ██ ██ ██ ░░
██ ██ ██ ██ ██ ██ ██ ██ ██
████████████████████████████`,
  face: `      .─────────.
     /  ◐     ◑  \\
    │   ╲     ╱   │
    │    \`───\`    │
     \\    ───    /
      \`─────────'`,
};
function ImageNode({ node, onPortDown }) {
  const art = ASCII_IMAGES[node.data?.kind || 'mountain'];
  return (
    <>
      <div className="image-frame" data-drag-handle>
        <div className="ascii-image">{art}</div>
      </div>
      <div className="image-cap" data-drag-handle>
        <span className="name">{node.data?.name || 'untitled.ascii'}</span>
        <span>240×160</span>
      </div>
      <Ports onPortDown={onPortDown} nodeId={node.id} />
    </>
  );
}

// --- TERMINAL ---
const SYSTEM_LOGO = `
█   █ ████  █   █ █      █████
█  █  █   █ ██  █ █      █   █
███   ████  █ █ █ █      █   █
█  █  █  █  █  ██ █      █   █
█   █ █   █ █   █ █████  █████`;

const INITIAL_TERM = [
  { kind: 'ascii', text: SYSTEM_LOGO },
  { kind: 'dim',  text: 'krnl0 · v0.1.0 · claude code attached · tmux session "main"' },
  { kind: 'dim',  text: '─────────────────────────────────────────────────────────' },
  { kind: 'prompt', cwd: '~/krnl0', cmd: 'krnl init --board "deep work"' },
  { kind: 'acid', text: '✓ board created · 6 nodes · 4 connections' },
  { kind: 'dim',  text: '  → spawned: pomodoro, habits, todo, terminal' },
  { kind: 'prompt', cwd: '~/krnl0', cmd: 'claude "wire pomodoro start → todo[0] focus"' },
  { kind: 'rust', text: '◆ claude is thinking...' },
  { kind: 'plain', text: '  Connecting pomo.025 ──► td.list' },
  { kind: 'plain', text: '  When timer starts, the first incomplete' },
  { kind: 'plain', text: '  task will be highlighted in your todo node.' },
  { kind: 'acid', text: '✓ wired. try it: press START on the pomodoro.' },
  { kind: 'prompt', cwd: '~/krnl0', cmd: 'vim journal/2026-05-03.md' },
  { kind: 'dim',  text: '  [opened in embedded vim · :w to save back]' },
];

function TerminalNode({ node, onPortDown }) {
  const [lines, setLines] = useState(INITIAL_TERM);
  const [input, setInput] = useState('');
  const bodyRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [lines]);

  const focusInput = (e) => {
    // Don't focus when clicking the drag handle
    if (e.target.closest('[data-drag-handle]')) return;
    inputRef.current?.focus();
  };

  const submit = (e) => {
    if (e.key !== 'Enter') return;
    const cmd = input.trim();
    if (!cmd) return;
    const next = [...lines, { kind: 'prompt', cwd: '~/krnl0', cmd }];

    if (cmd === 'help' || cmd === '?') {
      next.push({ kind: 'dim', text: 'commands: help · clear · ls · claude <msg> · vim <file>' });
    } else if (cmd === 'clear' || cmd === 'cls') {
      setLines([INITIAL_TERM[0], INITIAL_TERM[1]]);
      setInput(''); return;
    } else if (cmd === 'ls') {
      next.push({ kind: 'plain', text: 'boards/  habits.json  pomo.log  todo.md  journal/' });
    } else if (cmd.startsWith('claude ')) {
      next.push({ kind: 'rust', text: '◆ claude is thinking...' });
      next.push({ kind: 'plain', text: '  ' + (cmd.slice(7) || 'hello, what should we do?') });
      next.push({ kind: 'acid', text: '✓ done.' });
    } else if (cmd.startsWith('vim ') || cmd.startsWith('emacs ')) {
      next.push({ kind: 'dim', text: `  [opened ${cmd.split(' ')[1]} in embedded editor]` });
    } else {
      next.push({ kind: 'plain', text: `${cmd}: ` , append: <span style={{ color: 'var(--term-rust)' }}>command not found — try </span>});
      next.push({ kind: 'dim', text: '  try: help · ls · claude <msg>' });
    }

    setLines(next);
    setInput('');
  };

  return (
    <>
      <div className="term-head" data-drag-handle>
        <div className="lights">
          <div className="light r" /><div className="light y" /><div className="light g" />
        </div>
        <div className="label">claude-code · ~/krnl0 · zsh</div>
        <div className="badge">●&nbsp;LIVE</div>
      </div>
      <div className="term-body" ref={bodyRef} onClick={focusInput}>
        {lines.map((l, i) => {
          if (l.kind === 'ascii') return <pre key={i} className="term-ascii">{l.text}</pre>;
          if (l.kind === 'prompt') {
            return (
              <div key={i} className="term-line">
                <span style={{ color: 'var(--term-acid)' }}>❯</span>{' '}
                <span style={{ color: 'var(--term-rust)' }}>{l.cwd}</span>{' '}
                <span style={{ opacity: 0.5 }}>·</span>{' '}
                <span>{l.cmd}</span>
              </div>
            );
          }
          return <div key={i} className={`term-line ${l.kind}`}>{l.text}</div>;
        })}
        <div className="term-prompt term-line">
          <span className="sigil">❯</span>
          <span className="path">~/krnl0</span>
          <span className="arrow">·</span>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={submit}
            spellCheck={false}
            autoComplete="off"
            placeholder="type a command — try `help`"
          />
        </div>
      </div>
      <Ports onPortDown={onPortDown} nodeId={node.id} />
    </>
  );
}

// --- Dispatcher ---
function NodeBody({ node, onPortDown }) {
  switch (node.kind) {
    case 'pomodoro': return <PomodoroNode node={node} onPortDown={onPortDown} />;
    case 'habit':    return <HabitNode    node={node} onPortDown={onPortDown} />;
    case 'todo':     return <TodoNode     node={node} onPortDown={onPortDown} />;
    case 'text':     return <TextNode     node={node} onPortDown={onPortDown} />;
    case 'image':    return <ImageNode    node={node} onPortDown={onPortDown} />;
    case 'terminal': return <TerminalNode node={node} onPortDown={onPortDown} />;
    default: return null;
  }
}

Object.assign(window, { NodeBody });
