// Calendar task popup — opened by clicking a task block.
// Header (colour dot, name, when), a start → end editor with a segmented
// length picker and fine stepper, one save button, and a row of actions.
// Stays on screen; Esc closes, Enter saves.

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { toneVarForTask } from '../../../utils/taskColor';
import { TimeField } from '../../ui/TimeField';
import { CloseButton } from '../../ui/CloseButton';

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
  /** Save the edited time; `time` overrides the draft when the caller has a
   *  fresher value than the last render (Enter in the time field). */
  onApply: (time?: string) => void;
  onActivate: () => void;
  onJump: () => void;
  onUnschedule: () => void;
  onClose: () => void;
}

const W = 340;
const QUICK = [15, 30, 45, 60, 90, 120];

const hm = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const fmtLen = (m: number) => (m < 60 ? `${m}m` : m % 60 === 0 ? `${m / 60}h` : `${Math.floor(m / 60)}h${m % 60}`);
const addMin = (hhmm: string, min: number): string => {
  const [h, m] = hhmm.split(':').map(Number);
  if (h === undefined || m === undefined || !Number.isFinite(h) || !Number.isFinite(m)) return '--:--';
  const t = (((h * 60 + m + min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') p.onClose();
      if (e.key === 'Enter' && dirty) p.onApply();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [p, dirty]);

  const left = Math.max(8, Math.min(p.x + 6, window.innerWidth - W - 8));
  const top = Math.max(8, Math.min(p.y + 8, window.innerHeight - 340));

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
          border: '1px solid var(--paper-3)', borderRadius: 14,
          boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
          overflow: 'hidden', fontFamily: 'var(--font-sans)',
          animation: 'krnl-pop-in 140ms ease-out',
        }}
      >
        <style>{'@keyframes krnl-pop-in { from { opacity: 0; transform: translateY(4px) scale(0.98); } to { opacity: 1; transform: none; } }'}</style>

        {/* Header: colour dot, name, when */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '14px 12px 12px 16px' }}>
          <span aria-hidden style={{ width: 10, height: 10, borderRadius: 999, background: tone, marginTop: 5, flexShrink: 0, boxShadow: `0 0 0 3px color-mix(in srgb, ${tone} 22%, transparent)` }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 650, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', textDecoration: task.done ? 'line-through' : 'none', opacity: task.done ? 0.6 : 1 }}>
              {task.text || 'Untitled task'}
            </div>
            <div style={{ marginTop: 4, fontSize: 12, color: 'var(--ink-3)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
              {day} · {task.timeOpen ? `${hm(startMs)} · no set length` : `${hm(startMs)}–${hm(endMs)} · ${fmtLen(task.scheduledDurationMin)}`}
            </div>
          </div>
          <CloseButton onClick={p.onClose} />
        </div>

        {/* Editor */}
        <div style={{ padding: '0 16px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'end', gap: 8 }}>
            <div style={field}>
              <span style={fieldLabel}>Start</span>
              <TimeField
                testId="task-popup-time"
                value={p.time}
                onChange={p.onTime}
                // "Esc closes, Enter saves" also while typing in the field.
                onEnter={(t) => { if ((t !== hm(startMs) || durChanged) && dur > 0) p.onApply(t); else p.onClose(); }}
                onEscape={p.onClose}
              />
            </div>
            <span aria-hidden style={{ color: 'var(--ink-4)', paddingBottom: 9, fontSize: 13 }}>→</span>
            <div style={field}>
              <span style={fieldLabel}>End</span>
              <div style={{ ...input, color: dur > 0 ? 'var(--ink-2)' : 'var(--ink-4)', background: 'transparent' }}>{dur > 0 ? addMin(p.time, dur) : '—'}</div>
            </div>
          </div>

          <div style={field}>
            <span style={fieldLabel}>Length</span>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${QUICK.length}, 1fr)`, gap: 2, padding: 2, borderRadius: 9, background: 'var(--paper-2)', border: '1px solid var(--paper-3)' }}>
              {QUICK.map((m) => (
                <button key={m} type="button" onClick={() => p.onDuration(String(m))} style={seg(dur === m)}>{fmtLen(m)}</button>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <button type="button" aria-label="5 minutes less" onClick={() => p.onDuration(String(Math.max(5, dur - 5)))} style={stepBtn}>−</button>
              <div style={{ ...input, flex: 1, justifyContent: 'center', gap: 4, padding: '0 8px' }}>
                <input data-testid="task-popup-duration" type="number" min={1} value={p.duration} placeholder="—" onChange={(e) => p.onDuration(e.target.value)}
                  style={{ width: 48, border: 'none', background: 'transparent', color: 'var(--ink)', font: 'inherit', textAlign: 'right', outline: 'none', padding: '6px 0' }} />
                <span style={{ color: 'var(--ink-4)', fontSize: 12 }}>min</span>
              </div>
              <button type="button" aria-label="5 minutes more" onClick={() => p.onDuration(String(dur + 5))} style={stepBtn}>+</button>
            </div>
          </div>

          <button
            type="button"
            data-testid="task-popup-apply-time"
            disabled={!dirty}
            onClick={() => p.onApply()}
            style={{ ...primaryBtn, opacity: dirty ? 1 : 0.35, cursor: dirty ? 'pointer' : 'default' }}
          >
            {dirty ? 'Save time' : 'No changes'}
          </button>
        </div>

        {/* Actions */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, padding: '10px 12px', borderTop: '1px solid var(--paper-3)', background: 'var(--paper-2)' }}>
          <button type="button" data-testid="calendar-task-activate" onClick={p.onActivate} style={actionBtn}>
            <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor"><path d="M3 1.5v9l7.5-4.5z" /></svg>
            Activate
          </button>
          <button type="button" data-testid="calendar-task-jump" onClick={p.onJump} style={actionBtn}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="6" cy="6" r="4" /><circle cx="6" cy="6" r="1.2" fill="currentColor" /></svg>
            Find
          </button>
          <button type="button" data-testid="calendar-task-unschedule" onClick={p.onUnschedule} title="Remove from the calendar (keeps the task)" style={{ ...actionBtn, color: 'var(--rust, #ff8e64)' }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><rect x="1.5" y="2.5" width="9" height="8" rx="1.5" /><path d="M1.5 5h9M4.5 7l3 2M7.5 7l-3 2" /></svg>
            Remove
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}

const field: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 };
const fieldLabel: React.CSSProperties = { fontSize: 10.5, fontWeight: 600, letterSpacing: '0.04em', color: 'var(--ink-4)' };
const input: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: 14, padding: '7px 9px', borderRadius: 8, height: 34,
  border: '1px solid var(--paper-3)', background: 'var(--paper-2)', color: 'var(--ink)', boxSizing: 'border-box',
  fontVariantNumeric: 'tabular-nums', width: '100%', display: 'flex', alignItems: 'center',
};
const stepBtn: React.CSSProperties = {
  width: 34, height: 34, flexShrink: 0, borderRadius: 8, border: '1px solid var(--paper-3)', background: 'var(--paper-2)',
  color: 'var(--ink-2)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0,
};
const seg = (on: boolean): React.CSSProperties => ({
  padding: '6px 0', borderRadius: 7, cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 11.5, whiteSpace: 'nowrap',
  border: 'none', fontWeight: on ? 650 : 500,
  background: on ? 'var(--acid)' : 'transparent',
  color: on ? 'var(--ink-on-bright, #111)' : 'var(--ink-3)',
  transition: 'background 120ms, color 120ms',
});
const primaryBtn: React.CSSProperties = {
  height: 36, borderRadius: 9, border: 'none', background: 'var(--acid)',
  color: 'var(--ink-on-bright, #111)', fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 650,
  transition: 'opacity 120ms',
};
const actionBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, whiteSpace: 'nowrap', minWidth: 0, overflow: 'hidden',
  padding: '7px 6px', borderRadius: 8, border: '1px solid var(--paper-3)', background: 'var(--paper)',
  color: 'var(--ink)', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 550,
};
