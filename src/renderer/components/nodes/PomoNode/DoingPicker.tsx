// Observe mode — "what am I doing?" in one row. Shows the current name
// (with its category or ☑ task) and opens a list of recent names, your
// tasks, and a field to type a new one. Picking sets what Start / Continue /
// Back to work records; ✕ clears it so the next span is asked about.

import { useRef, useState } from 'react';
import type { TagDef } from '../../../../shared/tags/classify';
import { Popover } from '../../ui/Popover';
import { CategoryIcon } from './CategoryIcon';

export interface DoingChoice {
  label: string;
  tag: string | null;
  taskId: string | null;
}

export interface DoingPickerProps {
  /** Word shown before the name: DOING while recording, NEXT when idle. */
  caption: string;
  current: DoingChoice | null;
  recents: readonly DoingChoice[];
  tasks: ReadonlyArray<{ id: string; text: string }>;
  library: readonly TagDef[];
  onPick: (choice: DoingChoice) => void;
  onClear: () => void;
}

const mono: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-4)' };

export function DoingPicker({ caption, current, recents, tasks, library, onPick, onClear }: DoingPickerProps) {
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const cat = (tag: string | null) => (tag ? library.find((t) => t.id === tag) : undefined);
  const curCat = current && !current.taskId ? cat(current.tag) : undefined;

  const pick = (c: DoingChoice) => { setOpen(false); setTyped(''); onPick(c); };
  const icon = (c: DoingChoice) => {
    if (c.taskId) return <span aria-hidden style={{ color: 'var(--ink-3)', width: 12, textAlign: 'center' }}>☑</span>;
    const t = cat(c.tag);
    return t ? <CategoryIcon id={t.id} color={t.color} size={12} /> : <span aria-hidden style={{ width: 12, textAlign: 'center', color: 'var(--ink-4)' }}>·</span>;
  };
  const row = (key: string, c: DoingChoice, testId: string) => {
    const on = !!current && current.label === c.label && current.taskId === c.taskId;
    const t = cat(c.tag);
    return (
      <button
        key={key}
        type="button"
        data-testid={testId}
        onClick={() => pick(c)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', cursor: 'pointer',
          padding: '5px 8px', borderRadius: 5, border: 'none',
          background: on ? 'color-mix(in srgb, var(--acid) 16%, transparent)' : 'transparent',
          color: on ? 'var(--ink)' : 'var(--ink-2)', fontFamily: 'var(--font-mono)', fontSize: 11,
        }}
      >
        {icon(c)}
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.label}</span>
        {t && !c.taskId && <span style={{ fontSize: 9, color: 'var(--ink-4)' }}>{t.label}</span>}
      </button>
    );
  };

  return (
    <>
      <div
        data-testid="pomo-now"
        style={{ display: 'flex', alignItems: 'center', gap: 6, height: 30, padding: '0 4px 0 8px', border: `1px solid ${curCat?.color ?? (current ? 'var(--acid)' : 'var(--paper-3)')}`, borderRadius: 5 }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <span style={mono}>{caption}</span>
        <button
          ref={anchor}
          type="button"
          data-testid="pomo-now-pick"
          title="Pick what you're doing: a recent one, a task, or type a new name"
          onClick={() => setOpen((o) => !o)}
          style={{
            flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6, height: '100%', padding: 0,
            background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
            fontFamily: 'var(--font-mono)', fontSize: 10.5, color: current ? 'var(--ink)' : 'var(--ink-4)',
          }}
        >
          {current && icon(current)}
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {current ? current.label : 'pick or type what you’re doing…'}
          </span>
          {curCat && <span style={{ fontSize: 9, color: 'var(--ink-3)' }}>{curCat.label}</span>}
          <span aria-hidden style={{ opacity: 0.6, fontSize: 8, color: 'var(--ink-3)' }}>▾</span>
        </button>
        {current && (
          <button
            type="button"
            data-testid="pomo-now-clear"
            aria-label="Clear"
            title="Clear — the next span will be asked about"
            onClick={onClear}
            style={{ background: 'transparent', border: 'none', color: 'var(--ink-3)', cursor: 'pointer', fontSize: 11, padding: '0 4px', lineHeight: 1 }}
          >
            ✕
          </button>
        )}
      </div>

      <Popover anchor={anchor.current} open={open} onClose={() => setOpen(false)} minWidth={220}>
        <div style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
          <input
            data-testid="pomo-now-type"
            autoFocus
            value={typed}
            placeholder="type something new…"
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && typed.trim()) pick({ label: typed.trim(), tag: null, taskId: null });
            }}
            style={{ margin: '2px 4px 4px', padding: '5px 7px', background: 'var(--paper-2)', border: '1px solid var(--paper-3)', borderRadius: 5, color: 'var(--ink)', fontFamily: 'var(--font-mono)', fontSize: 10.5, outline: 'none' }}
          />
          {recents.length > 0 && <span style={{ ...mono, padding: '4px 8px 2px' }}>Recent</span>}
          {recents.map((c, i) => row(`r-${i}`, c, `pomo-now-recent-${i}`))}
          {tasks.length > 0 && <span style={{ ...mono, padding: '8px 8px 2px' }}>Tasks</span>}
          {tasks.map((t) => row(`t-${t.id}`, { label: t.text, tag: null, taskId: t.id }, `pomo-now-task-${t.id}`))}
        </div>
      </Popover>
    </>
  );
}
