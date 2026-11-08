// Adding to Habits & Routines asks first (design "B · Ask in your words").
// Enter in the add row never adds: this card asks whether you want to tick
// the thing off (habit) or it just happens (routine), then only that kind's
// questions. Nothing is chosen for you; the button says what will be added.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { HabitSchedule, IsoDow } from './types';
import { Z } from '../../ui/layers';
import { TimeField } from '../../ui/TimeField';
import { toSchedule, type RepeatKind, type RepeatValue } from '../../ui/RepeatEditor';
import { IconCheck, IconClock } from '../../ui/repeatIcons';

export interface AddAnswer {
  kind: 'habit' | 'routine';
  schedule: HabitSchedule;
  /** Habit only: "3 times a week, any days". */
  perWeek?: number;
}

/** The answers so far; null = not answered yet (nothing is pre-chosen). */
export interface AskDraft {
  kind: 'habit' | 'routine' | null;
  often: RepeatKind | 'perWeek' | null;
  perWeek: number | null;
  days: IsoDow[];
  when: 'any' | 'at' | null;
  timeOfDay: string;
  durationMin: number | null;
}

export const EMPTY_ASK: AskDraft = { kind: null, often: null, perWeek: null, days: [], when: null, timeOfDay: '', durationMin: null };

const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

/** The Calendar draws a repeat inside one day; one that runs past 24:00 would be cut. */
function pastMidnight(t: string, len: number): boolean {
  const [h, m] = t.split(':').map(Number) as [number, number];
  return h * 60 + m + len > 24 * 60;
}

/** What is still missing, in words, or null when it can be added. */
export function askMissing(d: AskDraft): string | null {
  if (!d.kind) return 'Answer yes or no';
  if (d.kind === 'habit') {
    if (!d.often) return 'Pick how often';
    if (d.often === 'perWeek') return d.perWeek ? null : 'Pick how many times';
    if (d.often === 'weekly' && d.days.length === 0) return 'Pick its days';
    if (!d.when) return 'Pick any time or a set time';
    if (d.when === 'at' && !TIME_RE.test(d.timeOfDay)) return 'Pick a time';
    if (d.when === 'at' && !d.durationMin) return 'Pick how long';
    if (d.when === 'at' && d.durationMin && pastMidnight(d.timeOfDay, d.durationMin)) return 'Ends after midnight: start earlier or make it shorter';
    return null;
  }
  if (d.days.length === 0) return 'Pick its days';
  if (!TIME_RE.test(d.timeOfDay)) return 'Pick a start time';
  if (!d.durationMin) return 'Pick how long';
  if (pastMidnight(d.timeOfDay, d.durationMin)) return 'Ends after midnight: start earlier or make it shorter';
  return null;
}

/** The RepeatValue these answers make (only meaningful once askMissing is null). */
export function askToRepeat(d: AskDraft): RepeatValue {
  const days = [...d.days].sort((a, b) => a - b) as IsoDow[];
  const kind: RepeatKind = d.kind === 'routine'
    ? (days.length === 7 ? 'daily' : days.join() === '1,2,3,4,5' ? 'weekdays' : 'weekly')
    : (d.often === 'perWeek' || !d.often ? 'daily' : d.often);
  return {
    kind, days, timeOfDay: d.timeOfDay || '09:00', durationMin: d.durationMin ?? 60,
    itemKind: d.kind ?? 'habit', anyTime: d.kind === 'habit' && (d.when === 'any' || d.often === 'perWeek'),
  };
}

export function askToAnswer(d: AskDraft): AddAnswer | null {
  if (askMissing(d) || !d.kind) return null;
  const perWeek = d.kind === 'habit' && d.often === 'perWeek' && d.perWeek ? { perWeek: d.perWeek } : {};
  return { kind: d.kind, schedule: toSchedule(askToRepeat(d)), ...perWeek };
}

const DAYS: ReadonlyArray<{ dow: IsoDow; letter: string; name: string }> = [
  { dow: 1, letter: 'M', name: 'Monday' }, { dow: 2, letter: 'T', name: 'Tuesday' },
  { dow: 3, letter: 'W', name: 'Wednesday' }, { dow: 4, letter: 'T', name: 'Thursday' },
  { dow: 5, letter: 'F', name: 'Friday' }, { dow: 6, letter: 'S', name: 'Saturday' },
  { dow: 7, letter: 'S', name: 'Sunday' },
];
const HABIT_LEN = [10, 15, 30, 60];
const ROUTINE_LEN = [30, 60, 90, 120, 180, 240];
const fmtLen = (m: number) => (m < 60 ? `${m}m` : m % 60 ? `${Math.floor(m / 60)}h${m % 60}` : `${m / 60}h`);
const endOf = (t: string, len: number) => {
  const [h, m] = t.split(':').map(Number) as [number, number];
  const e = Math.min(24 * 60, h * 60 + m + len);
  return `${String(Math.floor(e / 60) % 24).padStart(2, '0')}:${String(e % 60).padStart(2, '0')}`;
};

interface Props {
  name: string;
  /** The add row's box: the card opens above it. */
  anchor: { left: number; right: number; top: number };
  onAdd: (a: AddAnswer) => void;
  onCancel: () => void;
  /** Names already in the node (lower-case): a second "Gym" is allowed, but said. */
  taken?: ReadonlySet<string>;
}

export function HabitAddAsk({ name, anchor, onAdd, onCancel, taken }: Props) {
  const dup = taken?.has(name.trim().toLowerCase()) ?? false;
  const [d, setD] = useState<AskDraft>(EMPTY_ASK);
  const set = (patch: Partial<AskDraft>) => setD((cur) => ({ ...cur, ...patch }));
  const missing = askMissing(d);
  const add = () => { const a = askToAnswer(d); if (a) onAdd(a); };

  // Keys: Y / N answer the first question, Enter adds once complete, Esc cancels.
  const latest = useRef({ d, add, onCancel });
  latest.current = { d, add, onCancel };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { d: cur, add: doAdd, onCancel: cancel } = latest.current;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(); return; }
      const typing = e.target instanceof HTMLInputElement && !e.target.dataset['habitAdd'];
      if (typing) return;
      if (!cur.kind && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); e.stopPropagation(); setD({ ...EMPTY_ASK, kind: 'habit' }); return; }
      if (!cur.kind && (e.key === 'n' || e.key === 'N')) { e.preventDefault(); e.stopPropagation(); setD({ ...EMPTY_ASK, kind: 'routine' }); return; }
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (cur.kind) doAdd(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  // Open above the add row, inside the window (measured once drawn).
  const ref = useRef<HTMLDivElement>(null);
  const [h, setH] = useState(220);
  useLayoutEffect(() => {
    const m = ref.current?.offsetHeight ?? 0;
    if (m && Math.abs(m - h) > 1) setH(m);
  });
  const W = 340;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const left = Math.max(8, Math.min(anchor.right - W, vw - W - 8));
  const top = Math.max(8, Math.min(anchor.top - h - 8, vh - h - 8));

  const toggleDay = (dow: IsoDow) => set({ days: d.days.includes(dow) ? d.days.filter((x) => x !== dow) : [...d.days, dow] });
  const lit = (dow: IsoDow) => d.days.includes(dow);

  const card = (
    <div
      ref={ref}
      role="dialog"
      aria-label={`Add ${name}`}
      data-testid="habit-ask"
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'fixed', left, top, width: W, zIndex: Z.popover, boxSizing: 'border-box',
        maxHeight: vh - 16, overflowY: 'auto', padding: 14, borderRadius: 12,
        background: 'var(--paper)', color: 'var(--ink)', border: '1px solid var(--paper-3)',
        boxShadow: '0 18px 44px rgba(0,0,0,0.5)', fontFamily: 'var(--font-sans)',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}
    >
      {!d.kind ? (
        <>
          <div style={q}>Do you want to tick off <b style={{ color: 'var(--ink)' }}>{name}</b> when you do it?</div>
          <Answer testId="habit-ask-yes" icon={<IconCheck />} title="Yes, keep track" sub="a habit · tick it, keep a streak" k="Y" onClick={() => setD({ ...EMPTY_ASK, kind: 'habit' })} />
          <Answer testId="habit-ask-no" icon={<IconClock />} title="No, it just happens" sub="a routine · on your Calendar, never ticked" k="N" onClick={() => setD({ ...EMPTY_ASK, kind: 'routine' })} />
          {dup && (
            <div data-testid="habit-ask-dup" style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.4 }}>
              You already have one called <b style={{ color: 'var(--ink-2)' }}>{name}</b>. This adds a second; a different name keeps them apart.
            </div>
          )}
          <div style={foot}>Like a run (yes) or a class (no)<span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><Kbd>Esc</Kbd>cancel</span></div>
        </>
      ) : (
        <>
          <button type="button" data-testid="habit-ask-back" onClick={() => setD(EMPTY_ASK)} style={crumb} title="Back: habit or routine">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M10 3L5 8l5 5" /></svg>
            <b style={{ color: 'var(--ink)' }}>{name}</b> · {d.kind}
          </button>

          {d.kind === 'habit' ? (
            <>
              <div style={q}>How often?</div>
              <Seg testId="habit-ask-often" value={d.often} onPick={(v) => set({ often: v as AskDraft['often'] })}
                options={[['daily', 'Every day'], ['weekdays', 'Weekdays'], ['weekly', 'Pick days'], ['perWeek', 'Per week']]} />
              {d.often === 'weekly' && <DayRow lit={lit} onToggle={toggleDay} />}
              {d.often === 'perWeek' ? (
                <>
                  <div style={q}>How many times a week? <span style={{ color: 'var(--ink-4)' }}>Any days count.</span></div>
                  <div style={{ display: 'flex', gap: 5 }}>
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <button key={n} type="button" data-testid={`habit-ask-per-${n}`} onClick={() => set({ perWeek: n })} style={chip(d.perWeek === n)}>{n}×</button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div style={q}>At a set time?</div>
                  <Seg testId="habit-ask-when" value={d.when} onPick={(v) => set({ when: v as 'any' | 'at' })}
                    options={[['any', 'Any time'], ['at', 'At a time']]} />
                  {d.when === 'at' && (
                    <TimeLen time={d.timeOfDay} len={d.durationMin} lens={HABIT_LEN}
                      onTime={(t) => set({ timeOfDay: t })} onLen={(m) => set({ durationMin: m })} />
                  )}
                </>
              )}
            </>
          ) : (
            <>
              <div style={q}>Which days?</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" style={chip(d.days.length === 7)} onClick={() => set({ days: [1, 2, 3, 4, 5, 6, 7] })}>Every day</button>
                <button type="button" style={chip(d.days.length === 5 && [1, 2, 3, 4, 5].every((x) => d.days.includes(x as IsoDow)))} onClick={() => set({ days: [1, 2, 3, 4, 5] })}>Weekdays</button>
              </div>
              <DayRow lit={lit} onToggle={toggleDay} />
              <div style={q}>What time, and how long?</div>
              <TimeLen time={d.timeOfDay} len={d.durationMin} lens={ROUTINE_LEN}
                onTime={(t) => set({ timeOfDay: t })} onLen={(m) => set({ durationMin: m })} />
            </>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginTop: 2 }}>
            {missing && <span data-testid="habit-ask-missing" style={{ fontSize: 12, color: 'var(--ink-3)' }}>{missing}</span>}
            <button
              type="button"
              data-testid="habit-ask-add"
              disabled={!!missing}
              onClick={add}
              style={{
                height: 32, padding: '0 14px', borderRadius: 8, border: 'none', cursor: missing ? 'default' : 'pointer',
                background: missing ? 'var(--paper-3)' : 'var(--btn-primary-bg)', color: missing ? 'var(--ink-4)' : 'var(--btn-primary-fg)',
                fontSize: 12.5, fontWeight: 650, whiteSpace: 'nowrap', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis',
              }}
            >
              {missing ? `Add ${d.kind}` : `Add · ${summary(d)}`}
            </button>
          </div>
        </>
      )}
    </div>
  );
  return createPortal(
    <>
      <div onMouseDown={(e) => { e.stopPropagation(); onCancel(); }} style={{ position: 'fixed', inset: 0, zIndex: Z.popover - 1 }} />
      {card}
    </>,
    document.body,
  );
}

/** "weekdays · any time", "Mon Wed · 10:00–12:00". */
export function summary(d: AskDraft): string {
  if (d.kind === 'habit' && d.often === 'perWeek' && d.perWeek) return `${d.perWeek}× a week, any days`;
  const v = askToRepeat(d);
  const days = v.kind === 'daily' ? 'every day' : v.kind === 'weekdays' ? 'weekdays'
    : v.days.map((x) => DAYS.find((y) => y.dow === x)?.name.slice(0, 3)).join(' ');
  if (v.itemKind === 'habit' && v.anyTime) return `${days}, any time`;
  return `${days} ${v.timeOfDay}–${endOf(v.timeOfDay, v.durationMin)}`;
}

function Answer({ icon, title, sub, k, onClick, testId }: { icon: React.ReactNode; title: string; sub: string; k: string; onClick: () => void; testId: string }) {
  return (
    <button type="button" data-testid={testId} onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 9, cursor: 'pointer', textAlign: 'left',
        border: '1px solid var(--paper-3)', background: 'var(--paper-2)', color: 'var(--acid)', fontFamily: 'var(--font-sans)',
      }}>
      <span style={{ display: 'inline-flex' }}>{icon}</span>
      <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 13.5, fontWeight: 650, color: 'var(--ink)' }}>{title}</span>
        <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{sub}</span>
      </span>
      <Kbd>{k}</Kbd>
    </button>
  );
}

function Seg({ value, options, onPick, testId }: { value: string | null; options: Array<[string, string]>; onPick: (v: string) => void; testId: string }) {
  return (
    <div role="radiogroup" style={{
      display: 'grid', gridTemplateColumns: `repeat(${options.length}, 1fr)`, gap: 2, padding: 2, borderRadius: 9,
      background: 'var(--paper-2)', border: `1px solid ${value ? 'var(--paper-3)' : 'color-mix(in srgb, var(--acid) 45%, var(--paper-3))'}`,
    }}>
      {options.map(([v, label]) => {
        const on = v === value;
        return (
          <button key={v} type="button" role="radio" aria-checked={on} data-testid={`${testId}-${v}`} onClick={() => onPick(v)}
            style={{
              padding: '7px 0', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12.5, fontFamily: 'var(--font-sans)',
              fontWeight: on ? 650 : 500, background: on ? 'var(--paper)' : 'transparent', color: on ? 'var(--ink)' : 'var(--ink-3)',
              boxShadow: on ? '0 1px 3px rgba(0,0,0,0.3), inset 0 0 0 1px var(--paper-3)' : 'none',
            }}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

function DayRow({ lit, onToggle }: { lit: (d: IsoDow) => boolean; onToggle: (d: IsoDow) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5 }}>
      {DAYS.map((x) => {
        const on = lit(x.dow);
        return (
          <button key={x.dow} type="button" title={x.name} aria-pressed={on} data-testid={`habit-ask-day-${x.dow}`} onClick={() => onToggle(x.dow)}
            style={{
              height: 30, borderRadius: 999, cursor: 'pointer', padding: 0, fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 650,
              border: `1px solid ${on ? 'var(--acid)' : 'var(--paper-3)'}`, background: on ? 'var(--acid)' : 'transparent',
              color: on ? 'var(--ink-on-bright, #111)' : 'var(--ink-3)',
            }}>
            {x.letter}
          </button>
        );
      })}
    </div>
  );
}

function TimeLen({ time, len, lens, onTime, onLen }: { time: string; len: number | null; lens: number[]; onTime: (t: string) => void; onLen: (m: number) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <TimeField value={time} onChange={onTime} placeholder="--:--" testId="habit-ask-time" style={{ width: 104 }} />
        {TIME_RE.test(time) && len ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-3)' }}>→ {endOf(time, len)}</span> : null}
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {lens.map((m) => (
          <button key={m} type="button" data-testid={`habit-ask-len-${m}`} onClick={() => onLen(m)} style={chip(len === m)}>{fmtLen(m)}</button>
        ))}
      </div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 18, height: 18, padding: '0 4px', boxSizing: 'border-box',
      borderRadius: 4, border: '1px solid var(--paper-3)', background: 'var(--paper-2)', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-2)',
    }}>{children}</span>
  );
}

const q: React.CSSProperties = { fontSize: 13.5, lineHeight: 1.4, color: 'var(--ink-2)' };
const foot: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11.5, color: 'var(--ink-4)' };
const crumb: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start', padding: 0, border: 'none', background: 'transparent',
  cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--ink-3)',
};
const chip = (on: boolean): React.CSSProperties => ({
  minWidth: 38, height: 26, padding: '0 9px', borderRadius: 999, cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 11.5,
  border: `1px solid ${on ? 'var(--acid)' : 'var(--paper-3)'}`,
  background: on ? 'color-mix(in srgb, var(--acid) 18%, transparent)' : 'transparent',
  color: on ? 'var(--ink)' : 'var(--ink-3)',
});

