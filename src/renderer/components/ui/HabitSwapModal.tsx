// HabitSwapModal — shown after a habit is dropped on a calendar day: choose
// how it repeats (the dropped weekday, every day, weekdays or picked days),
// when, and for how long. Renders via createPortal into document.body.
// Keys: ← this weekday, → every day, Enter confirms, Esc cancels.

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { HabitSchedule, IsoDow } from '../nodes/HabitNode/types';
import { HabitIcon } from '../nodes/HabitNode/HabitIcon';
import { IconCalendarDay, IconRepeat, IconCheck } from './repeatIcons';
import { RepeatEditor, describeRepeat, isRepeatValid, toSchedule, type RepeatValue } from './RepeatEditor';

const DOW_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

export interface HabitSwapModalProps {
  habitName: string;
  habitIcon: string | undefined;
  habitNumber: number;             // 1-based
  streakDays: number;
  dropDayYMD: string;              // YYYY-MM-DD where they dropped
  isoDow: IsoDow;                  // ISO dow of dropDayYMD
  defaultTimeOfDay: string;        // "HH:MM" — derived from the drop hour
  defaultDurationMin: number;
  onConfirm: (schedule: HabitSchedule) => void;
  onCancel: () => void;
}

export function HabitSwapModal(props: HabitSwapModalProps): JSX.Element | null {
  const { habitName, habitIcon, streakDays, dropDayYMD, isoDow, defaultTimeOfDay, defaultDurationMin, onConfirm, onCancel } = props;
  const wday = DOW_FULL[isoDow - 1] ?? '';

  const [value, setValue] = useState<RepeatValue>({
    kind: 'weekly', days: [isoDow], timeOfDay: defaultTimeOfDay, durationMin: defaultDurationMin,
  });
  const valid = isRepeatValid(value);
  const confirm = () => { if (valid) onConfirm(toSchedule(value)); };

  const isThisDay = value.kind === 'weekly' && value.days.length === 1 && value.days[0] === isoDow;
  const isDaily = value.kind === 'daily';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inInput = e.target instanceof HTMLInputElement;
      if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
      else if (e.key === 'Enter') { e.preventDefault(); confirm(); }
      else if (!inInput && e.key === 'ArrowLeft') { e.preventDefault(); setValue((v) => ({ ...v, kind: 'weekly', days: [isoDow] })); }
      else if (!inInput && e.key === 'ArrowRight') { e.preventDefault(); setValue((v) => ({ ...v, kind: 'daily' })); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const date = new Date(dropDayYMD + 'T00:00:00');
  const dateLabel = date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

  // React events bubble through the React tree even across a portal, so stop
  // them here or a click inside also selects the calendar node underneath.
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  const modal = (
    <div
      onClick={(e) => { e.stopPropagation(); onCancel(); }}
      onPointerDown={stop} onPointerUp={stop} onMouseDown={stop} onMouseUp={stop} onContextMenu={stop}
      style={{ position: 'fixed', inset: 0, background: 'rgba(6,6,4,0.55)', zIndex: 250, display: 'grid', placeItems: 'center' }}
    >
      <div
        data-testid="habit-swap-modal"
        role="dialog"
        aria-label={`Repeat ${habitName}`}
        onClick={stop} onPointerDown={stop} onPointerUp={stop} onMouseDown={stop} onMouseUp={stop} onContextMenu={stop}
        style={{
          width: 440, maxWidth: 'calc(100vw - 32px)', boxSizing: 'border-box',
          background: 'var(--paper)', color: 'var(--ink)', fontFamily: 'var(--font-sans)',
          border: '1px solid var(--paper-3)', borderRadius: 16,
          boxShadow: '0 30px 80px rgba(0,0,0,0.5)', overflow: 'hidden',
          animation: 'krnl-habit-pop 160ms ease-out',
        }}
      >
        <style>{'@keyframes krnl-habit-pop { from { opacity: 0; transform: translateY(6px) scale(0.98); } to { opacity: 1; transform: none; } }'}</style>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 16px 14px 18px' }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, display: 'grid', placeItems: 'center', fontSize: 19, background: 'var(--paper-2)', border: '1px solid var(--paper-3)', flexShrink: 0 }}>
            <HabitIcon icon={habitIcon} size={19} fallback="↻" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 650, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{habitName}</div>
            <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>
              Dropped on {dateLabel}{streakDays > 0 ? ` · ${streakDays}-day streak` : ''}
            </div>
          </div>
          <button type="button" aria-label="Cancel" onClick={onCancel} style={iconBtn}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M2 2l8 8M10 2l-8 8" /></svg>
          </button>
        </div>

        {/* Two quick picks */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '0 18px 16px' }}>
          <button type="button" data-testid="habit-swap-weekly" data-kind="weekly" onClick={() => setValue((v) => ({ ...v, kind: 'weekly', days: [isoDow] }))} style={pick(isThisDay)}>
            <span style={pickTitle}><IconCalendarDay />Every {wday}</span>
            <span style={pickSub}>once a week</span>
          </button>
          <button type="button" data-testid="habit-swap-daily" data-kind="daily" onClick={() => setValue((v) => ({ ...v, kind: 'daily' }))} style={pick(isDaily)}>
            <span style={pickTitle}><IconRepeat />Every day</span>
            <span style={pickSub}>daily streak</span>
          </button>
        </div>

        <div style={{ padding: '14px 18px 18px', borderTop: '1px solid var(--paper-3)' }}>
          <input data-testid="habit-swap-time-input" type="hidden" value={value.timeOfDay} readOnly />
          <RepeatEditor value={value} onChange={setValue} testIdPrefix="habit-swap" />
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px 12px 18px', background: 'var(--paper-2)', borderTop: '1px solid var(--paper-3)' }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: valid ? 'var(--ink-2)' : 'var(--rust, #ff8e64)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {valid ? describeRepeat(value) : 'Pick at least one day'}
          </span>
          <button data-testid="habit-swap-cancel" type="button" onClick={onCancel} style={ghostBtn}>Cancel</button>
          <button
            data-testid="habit-swap-confirm"
            type="button"
            disabled={!valid}
            onClick={confirm}
            style={{ ...primaryBtn, opacity: valid ? 1 : 0.4, cursor: valid ? 'pointer' : 'not-allowed' }}
          >
            <IconCheck />Schedule
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

const pick = (on: boolean): React.CSSProperties => ({
  display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3,
  padding: '12px 14px', borderRadius: 12, cursor: 'pointer', textAlign: 'left', font: 'inherit',
  border: `1.5px solid ${on ? 'var(--acid)' : 'var(--paper-3)'}`,
  background: on ? 'color-mix(in srgb, var(--acid) 12%, var(--paper))' : 'var(--paper-2)',
  color: 'var(--ink)', transition: 'border-color 120ms, background 120ms',
});
const pickTitle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 14, fontWeight: 650, whiteSpace: 'nowrap' };
const pickSub: React.CSSProperties = { fontSize: 11.5, color: 'var(--ink-3)', paddingLeft: 21 };
const primaryBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  height: 34, padding: '0 16px', borderRadius: 9, border: 'none', background: 'var(--btn-primary-bg)',
  color: 'var(--btn-primary-fg)', fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 650,
};
const ghostBtn: React.CSSProperties = {
  height: 34, padding: '0 12px', borderRadius: 9, border: 'none', background: 'transparent',
  color: 'var(--ink-3)', fontFamily: 'var(--font-sans)', fontSize: 13, cursor: 'pointer',
};
const iconBtn: React.CSSProperties = {
  width: 30, height: 30, flexShrink: 0, borderRadius: 8, border: 'none', background: 'transparent',
  color: 'var(--ink-3)', cursor: 'pointer', display: 'grid', placeItems: 'center', padding: 0,
};
