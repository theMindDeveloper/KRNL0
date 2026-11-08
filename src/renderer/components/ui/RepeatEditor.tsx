// RepeatEditor — how a habit repeats: daily, weekdays or picked days, plus a
// time of day and a length. Shared by the calendar drop dialog
// (HabitSwapModal) and the Habit window's "add habit" row.

import type { HabitSchedule, IsoDow } from '../nodes/HabitNode/types';
import { NumberStepper } from './NumberStepper';
import { TimeField } from './TimeField';
import { IconRepeat, IconClock, IconTimer, IconCalendarAll, IconBriefcase, IconDots } from './repeatIcons';

export type RepeatKind = 'daily' | 'weekdays' | 'weekly';

export interface RepeatValue {
  kind: RepeatKind;
  days: IsoDow[];        // used when kind = 'weekly'
  timeOfDay: string;     // "HH:MM"
  durationMin: number;
  /** Decision 39 — a routine (repeats at a time, never ticked) or a habit (ticked). Default: habit. */
  itemKind?: 'habit' | 'routine';
  /** Habit only: no set time ("Any time"). A routine always has a time. */
  anyTime?: boolean;
}

/** A habit with no time; a routine never is. */
export const isAnyTime = (v: RepeatValue): boolean => v.itemKind !== 'routine' && v.anyTime === true;

const DAYS: ReadonlyArray<{ dow: IsoDow; letter: string; name: string }> = [
  { dow: 1, letter: 'M', name: 'Monday' }, { dow: 2, letter: 'T', name: 'Tuesday' },
  { dow: 3, letter: 'W', name: 'Wednesday' }, { dow: 4, letter: 'T', name: 'Thursday' },
  { dow: 5, letter: 'F', name: 'Friday' }, { dow: 6, letter: 'S', name: 'Saturday' },
  { dow: 7, letter: 'S', name: 'Sunday' },
];
const QUICK_LEN = [10, 15, 25, 30, 45, 60];
/** Routines run longer: a call, a class, a shift. */
const ROUTINE_LEN = [30, 60, 90, 120, 180, 240];

export function isRepeatValid(v: RepeatValue): boolean {
  const daysOk = v.kind !== 'weekly' || v.days.length > 0;
  if (isAnyTime(v)) return daysOk;
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v.timeOfDay)) return false;
  const [h, m] = v.timeOfDay.split(':').map(Number) as [number, number];
  return Number.isFinite(v.durationMin) && v.durationMin >= 5 && v.durationMin <= 720
    // Drawn inside one day: a repeat that runs past midnight would be cut.
    && h * 60 + m + v.durationMin <= 24 * 60
    && daysOk;
}

export function toSchedule(v: RepeatValue): HabitSchedule {
  const t = isAnyTime(v) ? {} : { timeOfDay: v.timeOfDay, durationMin: v.durationMin };
  if (v.kind === 'daily') return { kind: 'daily', ...t };
  if (v.kind === 'weekdays') return { kind: 'weekdays', ...t };
  return { kind: 'weekly', ...t, days: [...v.days].sort((a, b) => a - b) };
}

/** The editor's value for an existing habit or routine (Decision 39). */
export function fromSchedule(schedule: HabitSchedule | undefined, kind: 'habit' | 'routine'): RepeatValue {
  const base = { timeOfDay: schedule?.timeOfDay ?? '09:00', durationMin: schedule?.durationMin ?? 60, itemKind: kind, anyTime: kind === 'habit' && !schedule?.timeOfDay };
  if (!schedule || schedule.kind === 'daily') return { kind: 'daily', days: [], ...base };
  if (schedule.kind === 'weekdays') return { kind: 'weekdays', days: [], ...base };
  return { kind: 'weekly', days: [...schedule.days], ...base };
}

/** Plain-language summary, e.g. "Every Mon, Wed · 07:00 · 30 min". */
export function describeRepeat(v: RepeatValue): string {
  const when = v.kind === 'daily' ? 'Every day'
    : v.kind === 'weekdays' ? 'Weekdays'
    : v.days.length === 7 ? 'Every day'
    : v.days.length === 1 ? `Every ${DAYS.find((d) => d.dow === v.days[0])?.name ?? ''}`
    : `Every ${[...v.days].sort((a, b) => a - b).map((d) => DAYS.find((x) => x.dow === d)?.name.slice(0, 3)).join(', ')}`;
  const what = v.itemKind === 'routine' ? 'Routine · ' : '';
  return isAnyTime(v) ? `${when} · any time` : `${what}${when} · ${v.timeOfDay} · ${v.durationMin} min`;
}

function litDays(v: RepeatValue): Set<IsoDow> {
  if (v.kind === 'daily') return new Set([1, 2, 3, 4, 5, 6, 7]);
  if (v.kind === 'weekdays') return new Set([1, 2, 3, 4, 5]);
  return new Set(v.days);
}

interface Props {
  value: RepeatValue;
  onChange: (v: RepeatValue) => void;
  /** Optional presets shown before the standard ones (e.g. "Every Wed"). */
  testIdPrefix?: string;
}

export function RepeatEditor({ value, onChange, testIdPrefix = 'repeat' }: Props) {
  const lit = litDays(value);
  const set = (patch: Partial<RepeatValue>) => onChange({ ...value, ...patch });
  const toggleDay = (dow: IsoDow) => {
    const next = new Set(lit);
    if (next.has(dow)) next.delete(dow); else next.add(dow);
    const days = [...next].sort((a, b) => a - b) as IsoDow[];
    if (days.length === 7) set({ kind: 'daily', days });
    else set({ kind: 'weekly', days });
  };

  const routine = value.itemKind === 'routine';
  const anyTime = isAnyTime(value);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Decision 39 — the one new idea: does it just happen, or do I tick it? */}
      <div role="radiogroup" aria-label="Kind" style={{ ...segWrap, gridTemplateColumns: '1fr 1fr' }}>
        {([['routine', 'Routine', 'it just happens'], ['habit', 'Habit', 'I tick it']] as const).map(([k, name, sub]) => {
          const on = (k === 'routine') === routine;
          return (
            <button key={k} type="button" role="radio" aria-checked={on} data-testid={`${testIdPrefix}-item-${k}`}
              onClick={() => set({ itemKind: k, ...(k === 'routine' ? { anyTime: false } : {}) })}
              style={{ ...seg(on), flexDirection: 'column', gap: 2, padding: '7px 4px', whiteSpace: 'normal' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{k === 'routine' ? <IconClock /> : <IconRepeat />}{name}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 500, color: on ? 'var(--ink-2)' : 'var(--ink-4)' }}>{sub}</span>
            </button>
          );
        })}
      </div>

      {/* Repeat mode */}
      <div style={col}>
        <span style={label}><IconRepeat />Repeat</span>
        <div style={segWrap}>
          {(['daily', 'weekdays', 'weekly'] as const).map((k) => (
            <button
              key={k}
              type="button"
              data-testid={`${testIdPrefix}-kind-${k}`}
              onClick={() => set(k === 'weekly' ? { kind: k, days: value.days.length ? value.days : [...lit] as IsoDow[] } : { kind: k })}
              style={seg(value.kind === k)}
            >
              {k === 'daily' ? <IconCalendarAll /> : k === 'weekdays' ? <IconBriefcase /> : <IconDots />}
              {k === 'daily' ? 'Every day' : k === 'weekdays' ? 'Weekdays' : 'Pick days'}
            </button>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginTop: 4 }}>
          {DAYS.map((d) => {
            const on = lit.has(d.dow);
            return (
              <button
                key={d.dow}
                type="button"
                title={d.name}
                aria-pressed={on}
                data-testid={`${testIdPrefix}-day-${d.dow}`}
                onClick={() => toggleDay(d.dow)}
                style={{
                  height: 34, borderRadius: 999, cursor: 'pointer', padding: 0,
                  fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 650,
                  border: `1px solid ${on ? 'var(--acid)' : 'var(--paper-3)'}`,
                  background: on ? 'var(--acid)' : 'transparent',
                  color: on ? 'var(--ink-on-bright, #111)' : 'var(--ink-3)',
                  transition: 'background 120ms, color 120ms, border-color 120ms',
                }}
              >
                {d.letter}
              </button>
            );
          })}
        </div>
      </div>

      {/* A habit may have no time ("Any time"); a routine always has one. */}
      {!routine && (
        <div style={col}>
          <span style={label}><IconClock />When</span>
          <div style={{ ...segWrap, gridTemplateColumns: '1fr 1fr' }}>
            <button type="button" data-testid={`${testIdPrefix}-anytime`} onClick={() => set({ anyTime: true })} style={seg(anyTime)}>Any time</button>
            <button type="button" data-testid={`${testIdPrefix}-attime`} onClick={() => set({ anyTime: false })} style={seg(!anyTime)}>At a time</button>
          </div>
        </div>
      )}

      {/* Time + length */}
      {!anyTime && (
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 18, alignItems: 'start' }}>
        <div style={col}>
          <span style={label}><IconClock />Time</span>
          <TimeField value={value.timeOfDay} onChange={(t) => set({ timeOfDay: t })} testId={`${testIdPrefix}-time`} style={{ width: 104 }} />
        </div>
        <div style={col}>
          <span style={label}><IconTimer />Length</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <NumberStepper value={value.durationMin} onChange={(n) => set({ durationMin: n })} min={5} max={720} step={5} testId={`${testIdPrefix}-duration-input`} />
            <span style={{ fontSize: 12, color: 'var(--ink-4)' }}>min</span>
          </div>
          <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
            {(routine ? ROUTINE_LEN : QUICK_LEN).map((m) => (
              <button key={m} type="button" onClick={() => set({ durationMin: m })} style={chip(value.durationMin === m)}>{m}</button>
            ))}
          </div>
        </div>
      </div>
      )}
    </div>
  );
}

const col: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 };
const label: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, color: 'var(--ink-4)', fontFamily: 'var(--font-sans)' };
const segWrap: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2, padding: 2,
  borderRadius: 10, background: 'var(--paper-2)', border: '1px solid var(--paper-3)',
};
const seg = (on: boolean): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  padding: '7px 0', borderRadius: 8, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
  fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: on ? 650 : 500,
  background: on ? 'var(--paper)' : 'transparent',
  color: on ? 'var(--ink)' : 'var(--ink-3)',
  boxShadow: on ? '0 1px 3px rgba(0,0,0,0.3), inset 0 0 0 1px var(--paper-3)' : 'none',
  transition: 'background 120ms, color 120ms',
});
const chip = (on: boolean): React.CSSProperties => ({
  minWidth: 32, padding: '4px 7px', borderRadius: 999, cursor: 'pointer',
  fontFamily: 'var(--font-mono)', fontSize: 11,
  border: `1px solid ${on ? 'var(--acid)' : 'var(--paper-3)'}`,
  background: on ? 'color-mix(in srgb, var(--acid) 18%, transparent)' : 'transparent',
  color: on ? 'var(--ink)' : 'var(--ink-3)',
});
