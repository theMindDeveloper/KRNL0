// ROUTINES shelf of the Habits & Routines node (Decision 39 · routines.md F2/F3,
// design "B · Two shelves"). One line per routine: icon, name, the seven day
// letters, and what is next — never a tick.

import { useEffect, useState } from 'react';
import type { Habit, IsoDow } from './types';
import { routineOccurrence } from './types';
import { HabitIcon } from './HabitIcon';

const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const pad = (n: number) => String(n).padStart(2, '0');
const hm = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
const dowOf = (ymd: string): number => { const js = new Date(`${ymd}T00:00:00`).getDay(); return js === 0 ? 7 : js; };

export type RoutineStatus =
  | { kind: 'now'; until: number }
  | { kind: 'today'; at: number }
  | { kind: 'skipped'; date: string }
  | { kind: 'next'; date: string; at: number }
  | { kind: 'none' };

/**
 * What a routine's row says (F3): running now, later today, this coming
 * occurrence skipped, or the next one. Pure — tested.
 */
export function routineStatus(h: Habit, today: string, nowMin: number): RoutineStatus {
  const t = routineOccurrence(h, today);
  if (t && !t.skipped && nowMin >= t.startMin && nowMin < t.endMin) return { kind: 'now', until: t.endMin };
  if (t && !t.skipped && nowMin < t.startMin) return { kind: 'today', at: t.startMin };
  // The nearest coming occurrence: if it is skipped, say so; else when it is.
  for (let i = t && nowMin < t.endMin ? 0 : 1; i < 56; i++) {
    const date = addDays(today, i);
    const occ = routineOccurrence(h, date);
    if (!occ) continue;
    if (occ.skipped) return { kind: 'skipped', date };
    return { kind: 'next', date, at: occ.startMin };
  }
  return { kind: 'none' };
}

function sortKey(s: RoutineStatus, today: string): string {
  if (s.kind === 'now') return `0`;
  if (s.kind === 'today') return `1${pad(s.at)}`;
  if (s.kind === 'next') return `2${s.date}${pad(s.at)}`;
  if (s.kind === 'skipped') return `3${s.date}`;
  return `9${today}`;
}

function scheduledDows(h: Habit): Set<number> {
  const sch = h.schedule;
  if (!sch || sch.kind === 'daily') return new Set([1, 2, 3, 4, 5, 6, 7]);
  if (sch.kind === 'weekdays') return new Set([1, 2, 3, 4, 5]);
  return new Set<number>(sch.days as IsoDow[]);
}

interface Props {
  routines: readonly Habit[];
  today: string;
  /** Opens the routine's menu (click or right-click). */
  onMenu: (e: React.MouseEvent, id: string) => void;
}

export function RoutineShelf({ routines, today, onMenu }: Props) {
  // Minute clock for "now · until" / "today HH:MM".
  const [nowMin, setNowMin] = useState(() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); });
  useEffect(() => {
    const id = window.setInterval(() => { const d = new Date(); setNowMin(d.getHours() * 60 + d.getMinutes()); }, 30_000);
    return () => window.clearInterval(id);
  }, []);
  const rows = routines
    .map((h) => ({ h, s: routineStatus(h, today, nowMin) }))
    .sort((a, b) => sortKey(a.s, today).localeCompare(sortKey(b.s, today)));

  return (
    <div data-testid="routine-shelf" style={{ display: 'flex', flexDirection: 'column' }}>
      {rows.map(({ h, s }) => {
        const days = scheduledDows(h);
        const skippedDow = s.kind === 'skipped' ? dowOf(s.date) : null;
        const range = h.schedule?.timeOfDay ? `${h.schedule.timeOfDay}–${hm(Math.min(1440, (Number(h.schedule.timeOfDay.slice(0, 2)) * 60 + Number(h.schedule.timeOfDay.slice(3))) + (h.schedule.durationMin ?? 60)))}` : '';
        return (
          <div
            key={h.id}
            role="button"
            tabIndex={0}
            data-testid={`routine-row-${h.id}`}
            title={`${h.name} · ${range} · click for options`}
            onClick={(e) => onMenu(e, h.id)}
            onContextMenu={(e) => onMenu(e, h.id)}
            onKeyDown={(e) => { if (e.key === 'Enter') onMenu(e as unknown as React.MouseEvent, h.id); }}
            style={{ display: 'flex', alignItems: 'center', gap: 8, height: 28, cursor: 'pointer', borderRadius: 5 }}
          >
            <span style={{ color: `var(--${h.color})`, display: 'inline-flex', width: 16, justifyContent: 'center', flexShrink: 0, fontSize: 9 }}>
              {/* No icon picked yet: a dot in its colour, so the row never starts with a gap. */}
              <HabitIcon icon={h.icon} size={14} fallback="●" />
            </span>
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 600, color: 'var(--ink)', width: 84, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.name}</span>
            <span aria-label={`on ${[...days].sort().map((d) => DAY_SHORT[d - 1]).join(', ')}`} style={{ display: 'inline-flex', gap: 3, flexShrink: 0 }}>
              {LETTERS.map((l, i) => {
                const on = days.has(i + 1);
                const skip = skippedDow === i + 1;
                return (
                  <span key={i} aria-hidden style={{
                    fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, width: 9, textAlign: 'center',
                    color: skip ? 'var(--rust)' : on ? 'var(--ink-2)' : 'color-mix(in srgb, var(--ink-4) 75%, transparent)',
                    textDecoration: skip ? 'line-through' : undefined,
                  }}>{l}</span>
                );
              })}
            </span>
            <span style={{ marginLeft: 'auto', flexShrink: 0 }}>
              {s.kind === 'now' && <Chip tone="acid">now · until {hm(s.until)}</Chip>}
              {s.kind === 'today' && <Chip tone="acid">today {hm(s.at)}</Chip>}
              {s.kind === 'skipped' && <Chip tone="rust">skipped {DAY_SHORT[dowOf(s.date) - 1]}</Chip>}
              {s.kind === 'next' && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-3)' }}>{DAY_SHORT[dowOf(s.date) - 1]} {hm(s.at)}</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Chip({ tone, children }: { tone: 'acid' | 'rust'; children: React.ReactNode }) {
  const c = tone === 'acid' ? 'var(--acid-ink, var(--acid))' : 'var(--rust)';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', height: 20, padding: '0 7px', borderRadius: 999,
      fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', color: c,
      boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${c} 55%, transparent)`,
    }}>{children}</span>
  );
}
