// HabitSwapModal — two-card weekly/daily chooser shown after a habit is
// dropped on a calendar day cell. Replaces the RadialChooser for this flow.
// Renders via createPortal into document.body. Uses inline styles only.

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { IsoDow } from '../nodes/HabitNode/types';
import { NumberStepper } from './NumberStepper';

// ISO dow (1=Mon…7=Sun) → 0-based index for array lookup.
function isoDowToIdx(dow: IsoDow): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  return (dow - 1) as 0 | 1 | 2 | 3 | 4 | 5 | 6;
}

const DOW_FULL: Record<0 | 1 | 2 | 3 | 4 | 5 | 6, string> = {
  0: 'Monday',
  1: 'Tuesday',
  2: 'Wednesday',
  3: 'Thursday',
  4: 'Friday',
  5: 'Saturday',
  6: 'Sunday',
};

const DOW_SHORT: Record<0 | 1 | 2 | 3 | 4 | 5 | 6, string> = {
  0: 'Mon',
  1: 'Tue',
  2: 'Wed',
  3: 'Thu',
  4: 'Fri',
  5: 'Sat',
  6: 'Sun',
};

const DAY_LETTER: readonly string[] = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export interface HabitSwapModalProps {
  habitName: string;
  habitIcon: string | undefined;   // e.g. '◍' or '↺'
  habitNumber: number;             // 1-based (e.g. 3 → "#03")
  streakDays: number;
  dropDayYMD: string;              // YYYY-MM-DD where they dropped
  isoDow: IsoDow;                  // ISO dow of dropDayYMD
  defaultTimeOfDay: string;        // "HH:MM" — derive from drop hour in WeekView
  defaultDurationMin: number;      // 25 default
  onConfirm: (kind: 'weekly' | 'daily', timeOfDay: string, durationMin: number) => void;
  onCancel: () => void;
}

export function HabitSwapModal(props: HabitSwapModalProps): JSX.Element | null {
  const {
    habitName, habitIcon, habitNumber, streakDays,
    dropDayYMD, isoDow,
    defaultTimeOfDay, defaultDurationMin,
    onConfirm, onCancel,
  } = props;

  const weeklyBtnRef = useRef<HTMLButtonElement>(null);

  const [selectedKind, setSelectedKind] = useState<'weekly' | 'daily' | null>(null);
  const [time, setTime] = useState<string>(defaultTimeOfDay);
  const [durationMin, setDurationMin] = useState<number>(defaultDurationMin);

  // Auto-focus weekly card on mount.
  useEffect(() => {
    weeklyBtnRef.current?.focus();
  }, []);

  // Validate time and duration for the confirm button.
  const isTimeValid = /^\d{2}:\d{2}$/.test(time);
  const isDurationValid = Number.isFinite(durationMin) && durationMin >= 5 && durationMin <= 480;
  const canConfirm = selectedKind !== null && isTimeValid && isDurationValid;

  function handleConfirm() {
    if (!canConfirm) return;
    onConfirm(selectedKind!, time, durationMin);
  }

  // Keyboard: ← pre-selects weekly, → pre-selects daily. Enter confirms when selected. Esc cancels.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Arrow left/right card-selection is suppressed when focus is inside an
      // input (let the cursor move freely). Esc and Enter still work from inputs.
      const targetIsInput = e.target instanceof HTMLInputElement;
      if (targetIsInput && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setSelectedKind('weekly');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setSelectedKind('daily');
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleConfirm();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onConfirm, onCancel, selectedKind, time, durationMin, canConfirm]);

  // Derive display values from dropDayYMD.
  const dropDate = new Date(dropDayYMD + 'T00:00:00');
  const dayNum = String(dropDate.getDate()).padStart(2, '0');
  const monthYear = dropDate
    .toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    .toUpperCase();

  const dowIdx = isoDowToIdx(isoDow);
  const wdayFull = DOW_FULL[dowIdx];
  const wdayShort = DOW_SHORT[dowIdx];

  // ── Shared sub-card styles ─────────────────────────────────────────────────

  function cardBtnStyle(kind: 'weekly' | 'daily'): React.CSSProperties {
    const isSelected = selectedKind === kind;
    return {
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'stretch',
      gap: 10,
      padding: '22px 14px 16px',
      background: isSelected ? 'var(--node-bg)' : 'var(--paper-2)',
      border: `1.5px solid ${isSelected ? 'var(--acid)' : 'var(--paper-3)'}`,
      borderRadius: 10,
      cursor: 'pointer',
      textAlign: 'center',
      font: 'inherit',
      color: 'inherit',
      overflow: 'hidden',
      transition: 'transform 0.18s, border-color 0.18s, background 0.18s, box-shadow 0.18s',
      boxShadow: isSelected ? '0 12px 28px rgba(0,0,0,0.18)' : undefined,
    };
  }

  // ── Preview cells ──────────────────────────────────────────────────────────

  function renderPreview(allHit: boolean) {
    return (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: 3,
          padding: '0 16px',
        }}
      >
        {/* Day letter labels */}
        {DAY_LETTER.map((lbl, i) => (
          <div
            key={`dl-${i}`}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 8,
              color: 'var(--ink-4)',
              textAlign: 'center',
              paddingBottom: 3,
              textTransform: 'uppercase',
            }}
          >
            {lbl}
          </div>
        ))}
        {/* Cells */}
        {([0, 1, 2, 3, 4, 5, 6] as const).map((i) => {
          const isHit = allHit || i === dowIdx;
          return (
            <div
              key={`pv-${i}`}
              style={{
                height: 16,
                borderRadius: 2,
                background: isHit ? 'var(--ink)' : 'var(--paper-3)',
                border: `1px solid ${isHit ? 'var(--ink)' : 'var(--paper-3)'}`,
                opacity: isHit ? 1 : 0.35,
                position: 'relative',
              }}
            >
              {isHit && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 2,
                    background: 'var(--acid)',
                    borderRadius: 1,
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // ── Hover helpers via onMouseEnter/Leave ───────────────────────────────────

  function applyHover(btn: HTMLButtonElement, rotate: number) {
    if (selectedKind !== (btn.dataset['kind'] as 'weekly' | 'daily' | null)) {
      btn.style.borderColor = 'var(--ink)';
      btn.style.background = 'var(--node-bg)';
    }
    btn.style.transform = `translateY(-3px) rotate(${rotate}deg)`;
    btn.style.boxShadow = '0 12px 28px rgba(0,0,0,0.18)';
  }

  function removeHover(btn: HTMLButtonElement) {
    const kind = btn.dataset['kind'] as 'weekly' | 'daily' | undefined;
    const isSelected = selectedKind === kind;
    if (!isSelected) {
      btn.style.borderColor = 'var(--paper-3)';
      btn.style.background = 'var(--paper-2)';
      btn.style.boxShadow = '';
    }
    btn.style.transform = '';
  }

  // Label style for TIME / DURATION inputs
  const inputLabelStyle: React.CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontSize: 9.5,
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    color: 'var(--ink-3)',
    marginBottom: 3,
    display: 'block',
  };

  // ── Time picker (HH:MM) ────────────────────────────────────────────────────
  // Native <input type="time"> opens an OS-level picker (the chunky blue
  // scroll wheel on Windows) which is jarring against the KRNL0 chrome.
  // We swap it for two NumberStepper widgets — same component as the
  // duration field, so the cadence + time inputs share one language.
  const [tHH, tMM] = (() => {
    const m = /^(\d{1,2}):(\d{1,2})$/.exec(time);
    const hh = m ? Math.min(23, Math.max(0, Number.parseInt(m[1]!, 10))) : 0;
    const mm = m ? Math.min(59, Math.max(0, Number.parseInt(m[2]!, 10))) : 0;
    return [hh, mm] as const;
  })();
  const setHH = (hh: number) => setTime(`${String(Math.max(0, Math.min(23, hh))).padStart(2, '0')}:${String(tMM).padStart(2, '0')}`);
  const setMM = (mm: number) => setTime(`${String(tHH).padStart(2, '0')}:${String(Math.max(0, Math.min(59, mm))).padStart(2, '0')}`);

  // Stop a synthetic React event from bubbling through the portal back to the
  // canvas (React events bubble through the React tree, NOT the DOM tree — so
  // a click inside a portal still rises up the parent component tree). Without
  // this, a click on a button inside the modal also triggered a node-select
  // on the CalendarNode that opened the modal.
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  const modal = (
    // Veil (backdrop) — absorbs ALL pointer events, then on click cancels.
    <div
      onClick={(e) => { e.stopPropagation(); onCancel(); }}
      onPointerDown={stop}
      onPointerUp={stop}
      onMouseDown={stop}
      onMouseUp={stop}
      onContextMenu={stop}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(10,8,4,0.55)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        zIndex: 250,
        display: 'grid',
        placeItems: 'center',
      }}
    >
      {/* Card — stop ALL events so clicking inside doesn't close OR bubble. */}
      <div
        data-testid="habit-swap-modal"
        onClick={stop}
        onPointerDown={stop}
        onPointerUp={stop}
        onMouseDown={stop}
        onMouseUp={stop}
        onContextMenu={stop}
        style={{
          width: 560,
          maxWidth: 'calc(100vw - 40px)',
          background: 'var(--node-bg)',
          border: '1px solid var(--paper-3)',
          borderRadius: 12,
          boxShadow: '0 30px 80px rgba(0,0,0,0.45)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            borderBottom: '1px solid var(--paper-2)',
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            color: 'var(--ink-3)',
          }}
        >
          {/* Glyph tile */}
          <div
            style={{
              width: 30,
              height: 30,
              display: 'grid',
              placeItems: 'center',
              background: 'var(--paper-2)',
              border: '1px dashed var(--paper-3)',
              borderRadius: 4,
              color: 'var(--acid)',
              fontFamily: 'var(--font-mono)',
              fontSize: 14,
              flexShrink: 0,
            }}
          >
            {habitIcon ?? '◍'}
          </div>

          {/* Title block */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span
              style={{
                color: 'var(--ink)',
                fontFamily: 'var(--font-sans)',
                fontSize: 14,
                textTransform: 'none',
                letterSpacing: 0,
                fontWeight: 500,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {habitName}
            </span>
            <span style={{ color: 'var(--ink-4)', fontSize: 10 }}>
              habit · #{String(habitNumber).padStart(2, '0')} · streak {streakDays}d
            </span>
          </div>

          {/* Date block */}
          <div
            style={{
              marginLeft: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              textAlign: 'right',
              flexShrink: 0,
            }}
          >
            <span style={{ color: 'var(--ink-2)' }}>{monthYear}</span>
            <span
              style={{
                fontFamily: 'var(--font-serif)',
                fontSize: 22,
                color: 'var(--ink)',
                textTransform: 'none',
                letterSpacing: '-0.01em',
                lineHeight: 1,
              }}
            >
              {dayNum} · {wdayShort}
            </span>
          </div>
        </div>

        {/* Question row */}
        <div
          style={{
            textAlign: 'center',
            padding: '16px 18px 6px',
            fontFamily: 'var(--font-mono)',
            fontSize: 10.5,
            color: 'var(--ink-3)',
            textTransform: 'uppercase',
            letterSpacing: '0.14em',
          }}
        >
          {'drop landed on a day — '}
          <span style={{ color: 'var(--rust)' }}>swap left or right</span>
          {' to set cadence'}
        </div>

        {/* Two-card grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 12,
            padding: '10px 18px 18px',
          }}
        >
          {/* Weekly card */}
          <button
            ref={weeklyBtnRef}
            data-testid="habit-swap-weekly"
            data-kind="weekly"
            type="button"
            style={cardBtnStyle('weekly')}
            onClick={() => setSelectedKind('weekly')}
            onMouseEnter={(e) => applyHover(e.currentTarget, -1.2)}
            onMouseLeave={(e) => removeHover(e.currentTarget)}
          >
            {/* (Removed) corner arrow chip — was a stray decorative ornament
                that read as a back/forward button. Card click is the only
                affordance now. */}

            {/* Badge — locked-dark text on the rust pill so it stays
                readable across every theme (light / dark / high-contrast).
                Previous `color: var(--paper)` rendered as white-on-bright
                in some themes and failed contrast. */}
            <div style={{ alignSelf: 'center' }}>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9.5,
                  fontWeight: 700,
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  padding: '3px 9px',
                  borderRadius: 100,
                  background: 'var(--rust)',
                  color: '#0a0908',
                }}
              >
                weekly
              </span>
            </div>

            {/* H3 */}
            <div
              style={{
                fontFamily: 'var(--font-serif)',
                fontSize: 26,
                letterSpacing: '-0.01em',
                color: 'var(--ink)',
                lineHeight: 1.05,
                padding: '0 16px',
                margin: 0,
              }}
            >
              Every<br />{wdayFull}
            </div>

            {/* Preview */}
            {renderPreview(false)}

            {/* Meter */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                color: 'var(--ink-4)',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                padding: '0 12px',
                marginTop: -2,
              }}
            >
              <span>cadence</span>
              <span style={{ color: 'var(--ink-2)', fontWeight: 600 }}>1× / wk</span>
            </div>

            {/* Blurb */}
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                color: 'var(--ink-3)',
                textAlign: 'center',
                lineHeight: 1.45,
                letterSpacing: '0.04em',
                padding: '0 8px',
              }}
            >
              repeats on {wdayShort} only
            </div>
          </button>

          {/* Daily card */}
          <button
            data-testid="habit-swap-daily"
            data-kind="daily"
            type="button"
            style={cardBtnStyle('daily')}
            onClick={() => setSelectedKind('daily')}
            onMouseEnter={(e) => applyHover(e.currentTarget, 1.2)}
            onMouseLeave={(e) => removeHover(e.currentTarget)}
          >
            {/* (Removed) corner arrow chip — see weekly card. */}

            {/* Badge — locked-dark text for the same theme-safety reason. */}
            <div style={{ alignSelf: 'center' }}>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9.5,
                  fontWeight: 700,
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  padding: '3px 9px',
                  borderRadius: 100,
                  background: 'var(--acid)',
                  color: '#0a0908',
                }}
              >
                daily
              </span>
            </div>

            {/* H3 */}
            <div
              style={{
                fontFamily: 'var(--font-serif)',
                fontSize: 26,
                letterSpacing: '-0.01em',
                color: 'var(--ink)',
                lineHeight: 1.05,
                padding: '0 16px',
                margin: 0,
              }}
            >
              Every<br />day
            </div>

            {/* Preview */}
            {renderPreview(true)}

            {/* Meter */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                color: 'var(--ink-4)',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                padding: '0 12px',
                marginTop: -2,
              }}
            >
              <span>cadence</span>
              <span style={{ color: 'var(--ink-2)', fontWeight: 600 }}>7× / wk</span>
            </div>

            {/* Blurb */}
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                color: 'var(--ink-3)',
                textAlign: 'center',
                lineHeight: 1.45,
                letterSpacing: '0.04em',
                padding: '0 8px',
              }}
            >
              repeats every day · daily streak
            </div>
          </button>
        </div>

        {/* Time + Duration inputs */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 12,
            padding: '0 18px 16px',
          }}
        >
          {/* TIME — custom HH/MM steppers; no native browser picker. */}
          <div>
            <label style={inputLabelStyle}>
              Time
            </label>
            {/* Hidden mirror of the HH:MM string so existing tests/queries
                that target [data-testid="habit-swap-time-input"] keep
                working (read .value on the input). */}
            <input
              data-testid="habit-swap-time-input"
              type="hidden"
              value={time}
              readOnly
            />
            <div
              data-time-picker
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                animation: 'krnl-time-picker-in 220ms cubic-bezier(0.2, 0.8, 0.2, 1)',
              }}
            >
              <NumberStepper
                value={tHH}
                onChange={setHH}
                min={0}
                max={23}
                step={1}
                testId="habit-swap-time-hh"
              />
              <span
                aria-hidden
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 14,
                  color: 'var(--ink-3)',
                  fontWeight: 700,
                  lineHeight: 1,
                  userSelect: 'none',
                }}
              >
                :
              </span>
              <NumberStepper
                value={tMM}
                onChange={setMM}
                min={0}
                max={59}
                step={5}
                testId="habit-swap-time-mm"
              />
            </div>
          </div>
          {/* DURATION */}
          <div>
            <label style={inputLabelStyle}>
              Duration
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <NumberStepper
                value={durationMin}
                onChange={setDurationMin}
                min={5}
                max={480}
                step={5}
                testId="habit-swap-duration-input"
              />
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9.5,
                  color: 'var(--ink-3)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  flexShrink: 0,
                }}
              >
                MIN
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '10px 18px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            fontFamily: 'var(--font-mono)',
            fontSize: 9.5,
            color: 'var(--ink-4)',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            borderTop: '1px dashed var(--paper-3)',
          }}
        >
          <span>
            <kbd
              style={{
                fontFamily: 'var(--font-mono)',
                background: 'var(--paper-2)',
                border: '1px solid var(--paper-3)',
                borderRadius: 2,
                padding: '1px 5px',
                color: 'var(--ink-2)',
                marginRight: 5,
              }}
            >
              ←
            </kbd>
            weekly
          </span>
          <span>
            <kbd
              style={{
                fontFamily: 'var(--font-mono)',
                background: 'var(--paper-2)',
                border: '1px solid var(--paper-3)',
                borderRadius: 2,
                padding: '1px 5px',
                color: 'var(--ink-2)',
                marginRight: 5,
              }}
            >
              →
            </kbd>
            daily
          </span>
          <span>
            <kbd
              style={{
                fontFamily: 'var(--font-mono)',
                background: 'var(--paper-2)',
                border: '1px solid var(--paper-3)',
                borderRadius: 2,
                padding: '1px 5px',
                color: 'var(--ink-2)',
                marginRight: 5,
              }}
            >
              esc
            </kbd>
            cancel
          </span>
          <button
            data-testid="habit-swap-cancel"
            type="button"
            onClick={onCancel}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--ink-3)',
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              fontSize: 9.5,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              padding: '4px 8px',
              borderRadius: 3,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--rust)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--ink-3)';
            }}
          >
            cancel drop
          </button>
          {/* Confirm button — disabled until kind selected and inputs valid */}
          <button
            data-testid="habit-swap-confirm"
            type="button"
            disabled={!canConfirm}
            onClick={handleConfirm}
            style={{
              marginLeft: 'auto',
              background: canConfirm ? 'var(--acid)' : 'var(--paper-3)',
              border: 'none',
              color: canConfirm ? 'var(--ink)' : 'var(--ink-4)',
              cursor: canConfirm ? 'pointer' : 'not-allowed',
              fontFamily: 'var(--font-mono)',
              fontSize: 9.5,
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              padding: '5px 12px',
              borderRadius: 4,
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            confirm
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
