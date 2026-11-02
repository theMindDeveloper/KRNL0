// Calendar task popup — opened by clicking a task block.
// One clear header (colour, name, when), a compact start/length editor with
// quick lengths, and one row of actions. Stays on screen; Esc closes.

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { toneVarForTask } from '../../../utils/taskColor';

export interface TaskPopupTask {
  id: string;
  text: string;
  startISO: string;
  scheduledDurationMin: number;
  timeOpen: boolean;
  done: boolean;
}

interface Props {
  task: TaskPopupTask;
  x: number;
  y: number;
  time: string;
  duration: string;
  onTime: (v: string) => void;
  onDuration: (v: string) => void;
  onApply: () => void;
  onActivate: () => void;
  onJump: () => void;
  onUnschedule: () => void;
  onClose: () => void;
}

const W = 300;
const QUICK = [15, 30, 45, 60, 90];

const hm = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const fmtLen = (m: number) => (m < 60 ? `${m}m` : m % 60 === 0 ? `${m / 60}h` : `${Math.floor(m / 60)}h ${m % 60}m`);

export function TaskPopup(p: Props) {
  const { task } = p;
  const tone = toneVarForTask(task.id);
  const start = new Date(task.startISO);
  const startMs = start.getTime();
  const endMs = startMs + task.scheduledDurationMin * 60_000;
  const day = start.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  const dur = Number(p.duration) || 0;
  const startChanged = p.time !== hm(startMs);
  const durChanged = dur !== task.scheduledDurationMin || task.timeOpen;
  const dirty = (startChanged || (durChanged && dur > 0)) && dur > 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') p.onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [p]);

  const left = Math.max(8, Math.min(p.x + 6, window.innerWidth - W - 8));
  const top = Math.max(8, Math.min(p.y + 8, window.innerHeight - 250));

  return createPortal(
    <>
      <div onClick={p.onClose} style={{ position: 'fixed', inset: 0, zIndex: 1998 }} />
      <div
        data-testid="calendar-task-popup"
        role="dialog"
        aria-label={task.text}
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          position: 'fixed', left, top, width: W, zIndex: 1999, boxSizing: 'border-box',
          background: 'var(--paper)', color: 'var(--ink)',
          border: '1px solid var(--paper-3)', borderRadius: 12,
          boxShadow: '0 18px 40px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.02)',
          overflow: 'hidden', fontFamily: 'var(--font-sans)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', gap: 10, padding: '12px 12px 10px 14px', borderLeft: `4px solid ${tone}` }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 650, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', textDecoration: task.done ? 'line-through' : 'none' }}>
              {task.text || 'Untitled task'}
            </div>
            <div style={{ marginTop: 3, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-3)', fontVariantNumeric: 'tabular-nums' }}>
              {day} · {task.timeOpen ? `${hm(startMs)} · no set time` : `${hm(startMs)} – ${hm(endMs)} · ${fmtLen(task.scheduledDurationMin)}`}
            </div>
          </div>
          <button type="button" aria-label="Close" onClick={p.onClose} style={iconBtn}>✕</button>
        </div>

        {/* Editor */}
        <div style={{ padding: '10px 14px', borderTop: '1px solid var(--paper-3)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
            <label style={field}>
              <span style={fieldLabel}>Start</span>
              <input data-testid="task-popup-time" type="time" value={p.time} onChange={(e) => p.onTime(e.target.value)} style={{ ...input, width: 92 }} />
            </label>
            <label style={field}>
              <span style={fieldLabel}>Length (min)</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button type="button" aria-label="5 minutes less" onClick={() => p.onDuration(String(Math.max(5, dur - 5)))} style={stepBtn}>−</button>
                <input data-testid="task-popup-duration" type="number" min={1} value={p.duration} placeholder="—" onChange={(e) => p.onDuration(e.target.value)} style={{ ...input, width: 52, textAlign: 'center' }} />
                <button type="button" aria-label="5 minutes more" onClick={() => p.onDuration(String(dur + 5))} style={stepBtn}>+</button>
              </div>
            </label>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {QUICK.map((m) => (
              <button key={m} type="button" onClick={() => p.onDuration(String(m))} style={chip(dur === m)}>{fmtLen(m)}</button>
            ))}
            <div style={{ flex: 1 }} />
            <button
              type="button"
              data-testid="task-popup-apply-time"
              disabled={!dirty}
              onClick={p.onApply}
              style={{
                ...primaryBtn,
                opacity: dirty ? 1 : 0.4,
                cursor: dirty ? 'pointer' : 'default',
              }}
            >
              Apply
            </button>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 6, padding: '10px 14px 12px', borderTop: '1px solid var(--paper-3)', background: 'var(--paper-2)' }}>
          <button type="button" data-testid="calendar-task-activate" onClick={p.onActivate} style={actionBtn}>Activate</button>
          <button type="button" data-testid="calendar-task-jump" onClick={p.onJump} style={actionBtn}>Show on canvas</button>
          <div style={{ flex: 1 }} />
          <button type="button" data-testid="calendar-task-unschedule" onClick={p.onUnschedule} title="Remove from the calendar (keeps the task)" style={{ ...actionBtn, color: 'var(--rust, #ff8e64)', borderColor: 'transparent', background: 'transparent' }}>
            Unschedule
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}

const field: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 };
const fieldLabel: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-4)' };
const input: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: 13, padding: '5px 7px', borderRadius: 7,
  border: '1px solid var(--paper-3)', background: 'var(--paper-2)', color: 'var(--ink)', boxSizing: 'border-box',
};
const stepBtn: React.CSSProperties = {
  width: 26, height: 28, borderRadius: 7, border: '1px solid var(--paper-3)', background: 'transparent',
  color: 'var(--ink-2)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0,
};
const chip = (on: boolean): React.CSSProperties => ({
  padding: '3px 7px', borderRadius: 999, cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 10.5,
  border: `1px solid ${on ? 'var(--acid)' : 'var(--paper-3)'}`,
  background: on ? 'color-mix(in srgb, var(--acid) 18%, transparent)' : 'transparent',
  color: on ? 'var(--ink)' : 'var(--ink-3)',
});
const primaryBtn: React.CSSProperties = {
  padding: '6px 14px', borderRadius: 8, border: 'none', background: 'var(--acid)',
  color: 'var(--ink-on-bright, #111)', fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 650,
};
const actionBtn: React.CSSProperties = {
  padding: '6px 10px', borderRadius: 8, border: '1px solid var(--paper-3)', background: 'var(--paper)',
  color: 'var(--ink)', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 550,
};
const iconBtn: React.CSSProperties = {
  width: 26, height: 26, flexShrink: 0, borderRadius: 7, border: 'none', background: 'transparent',
  color: 'var(--ink-3)', cursor: 'pointer', fontSize: 12, lineHeight: 1,
};
