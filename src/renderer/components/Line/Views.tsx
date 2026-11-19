// The middle of the Line layout: Today (line or clock, then the day in words),
// Week (seven lines or seven dials) and Habits (the month).

import { useContext, useMemo, type ReactNode } from 'react';
import type { Board } from '../../../shared/types';
import { addDaysYMD } from '../../../shared/ymd';
import { setPlanDone, wontDoTask } from '../../store/planActions';
import { putPlanOnDay } from '../../store/scheduleActions';
import { LineGlyph } from '../ui/LineGlyph';
import { countOn, isDayScheduled, weeklyTarget, type Habit } from '../nodes/HabitNode/types';
import { habitStreak } from '../nodes/HabitNode/commands';
import { DayClock } from './DayClock';
import { DayLine, LineUiContext, rangeFor, type Ghost, type LineRange } from './DayLine';
import { dayData, fmtClock, fmtDur, habitRows, habitsOf, mondayOf, noTimeYet, type AnyTimeRow, type DayData, type PlanMark } from './dayData';
import { HabitChips } from './Parts';
import { tickHabit, toggleItem } from './lineActions';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

function Check({ on, onClick, label, testId, color }: { on: boolean; onClick: () => void; label: string; testId: string; color?: string }) {
  return (
    <button type="button" role="checkbox" aria-checked={on} aria-label={label} className="kl-chk" data-testid={testId} onClick={onClick} style={color ? { borderColor: color } : undefined}>
      {on && <LineGlyph name="check" size={12} weight={2.8} />}
    </button>
  );
}

export function Totals({ data, wrap = false, quiet = false }: { data: DayData; wrap?: boolean; quiet?: boolean }) {
  if (data.totals.length === 0 && data.unnamedMs === 0) return quiet ? null : <span className="kl-dim">nothing recorded</span>;
  return (
    <span style={{ fontSize: 11.5, whiteSpace: wrap ? 'normal' : 'nowrap' }} data-testid={`line-totals-${data.day}`}>
      {data.totals.map((t, i) => (
        <span key={t.label}>{i > 0 && <span style={{ color: 'var(--ink-4)' }}> · </span>}<span style={{ color: t.color }}>{t.label} {fmtDur(t.ms)}</span></span>
      ))}
      {data.unnamedMs > 0 && <span style={{ color: 'var(--ink-3)' }}>{data.totals.length > 0 ? ' · ' : ''}not named {fmtDur(data.unnamedMs)}</span>}
    </span>
  );
}

function PlanRow({ p, nowMs, isToday }: { p: PlanMark; nowMs: number; isToday: boolean }) {
  const ui = useContext(LineUiContext);
  if (p.kind === 'event' || !p.taskId) {
    return (
      <div className="kl-row" data-testid={`line-row-${p.id}`}>
        <span style={{ width: 18, flexShrink: 0 }} />
        <span className="kl-t">{fmtClock(p.startMs)}</span>
        <span className="kl-x" style={{ color: 'var(--ink-2)' }}>{p.text}</span>
        <span className="kl-sp" />
        <span className="kl-dim">repeats · {fmtDur(p.endMs - p.startMs)}</span>
      </div>
    );
  }
  const taskId = p.taskId;
  const done = p.state === 'done';
  const missed = p.state === 'missed';
  const meta = done ? (p.recordedMs > 0 ? `recorded ${fmtDur(p.recordedMs)}` : fmtDur(p.endMs - p.startMs))
    : p.state === 'covered' ? `recorded ${fmtDur(p.recordedMs)} during it`
      : missed ? 'its time passed'
        : `${fmtDur(p.endMs - p.startMs)}${isToday && p.startMs > nowMs ? ` · in ${fmtDur(p.startMs - nowMs)}` : isToday && p.startMs <= nowMs ? ' · now' : ''}`;
  return (
    <div className="kl-row" data-testid={`line-row-${p.id}`} data-state={p.state} style={done ? { color: 'var(--ink-4)' } : undefined}>
      <Check on={done} label={done ? `Not done: ${p.text}` : `Did it: ${p.text}`} testId={`line-check-${p.id}`} onClick={() => { void setPlanDone(taskId, !done); }} {...(missed ? { color: 'var(--rust)' } : {})} />
      <span className="kl-t" style={missed ? { color: 'var(--rust)' } : undefined}>{fmtClock(p.startMs)}</span>
      <button type="button" className="kl-x" onClick={(e) => ui.openPlan(p, { x: e.clientX, y: e.clientY })} title="Open this plan" style={{ background: 'transparent', border: 0, padding: 0, textAlign: 'left', cursor: 'pointer', textDecoration: done ? 'line-through' : 'none', fontSize: 13 }}>{p.text}</button>
      <span className="kl-sp" />
      <span className="kl-dim">{meta}</span>
      {(missed || p.state === 'covered') && <button type="button" className="kl-btn kl-btn--sm" data-testid={`line-did-${p.id}`} onClick={() => { void setPlanDone(taskId, true); }}>Did it</button>}
      {missed && <button type="button" className="kl-btn kl-btn--sm" data-testid={`line-later-${p.id}`} onClick={(e) => ui.openPlan(p, { x: e.clientX, y: e.clientY })}>Later</button>}
      {missed && <button type="button" className="kl-btn kl-btn--sm" data-testid={`line-skip-${p.id}`} title="Won't do: off the plan, not counted as missed" onClick={() => { wontDoTask(taskId); }}>Skip</button>}
    </div>
  );
}

function ItemRow({ r, action }: { r: AnyTimeRow; action?: ReactNode }) {
  const toggle = (): void => { if (r.taskId) void setPlanDone(r.taskId, !r.done); else void toggleItem(r.itemId); };
  return (
    <div className="kl-row" data-testid={`line-item-${r.itemId}`} style={r.done ? { color: 'var(--ink-4)' } : undefined}>
      <Check on={r.done} label={r.done ? `Not done: ${r.text}` : `Did it: ${r.text}`} testId={`line-check-item-${r.itemId}`} onClick={toggle} />
      <span className="kl-x" style={{ textDecoration: r.done ? 'line-through' : 'none' }}>{r.text}</span>
      <span className="kl-sp" />
      {action}
    </div>
  );
}

function DayList({ board, data, nowMs, isToday }: { board: Board | null; data: DayData; nowMs: number; isToday: boolean }) {
  const waiting = useMemo(() => noTimeYet(board), [board]);
  const plans = data.plans;
  const doneCount = plans.filter((p) => p.kind === 'plan' && p.state === 'done').length + data.anyTime.filter((a) => a.done).length;
  const total = plans.filter((p) => p.kind === 'plan').length + data.anyTime.length;
  const nowAt = isToday ? plans.findIndex((p) => p.startMs > nowMs) : -1;
  return (
    <div className="kl-cols">
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', height: 28 }}>
          <span className="kl-hdr">{isToday ? 'today' : 'that day'}</span><span className="kl-sp" />
          {total > 0 && <span className="kl-dim" data-testid="line-done-count">{doneCount} of {total} done</span>}
        </div>
        {total === 0 && plans.length === 0 && <div className="kl-dim" style={{ padding: '10px 0', whiteSpace: 'normal' }}>Nothing planned. Type a plan below, like "gym 18:00 1h".</div>}
        {plans.map((p, i) => (
          <div key={p.id}>
            {i === nowAt && i > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 20, fontSize: 10, color: 'var(--rust)' }}><span>now {fmtClock(nowMs)}</span><div style={{ flex: 1, borderTop: '1px solid var(--rust)', opacity: 0.55 }} /></div>
            )}
            <PlanRow p={p} nowMs={nowMs} isToday={isToday} />
          </div>
        ))}
        {data.anyTime.map((r) => <ItemRow key={r.itemId} r={r} action={<span className="kl-dim">any time</span>} />)}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', height: 28 }}><span className="kl-hdr">no time yet</span></div>
        {waiting.length === 0 && <div className="kl-dim" style={{ padding: '10px 0', whiteSpace: 'normal' }}>Plans without a day wait here.</div>}
        {waiting.map((r) => (
          <ItemRow key={r.itemId} r={r} action={
            <button type="button" className="kl-btn kl-btn--sm" data-testid={`line-onday-${r.itemId}`} title="Put it on this day, at any time" onClick={() => { void putPlanOnDay({ itemId: r.itemId }, data.day); }}>{isToday ? 'Today' : 'This day'}</button>
          } />
        ))}
      </div>
    </div>
  );
}

export function TodayView({ board, data, nowMs, isToday, shape, range, ghost }: { board: Board | null; data: DayData; nowMs: number; isToday: boolean; shape: 'line' | 'clock'; range: LineRange; ghost: Ghost | null }) {
  const habits = useMemo(() => habitRows(board, data.day), [board, data.day]);
  const habitRow = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
      <span className="kl-gutter" style={{ position: 'static', width: 52 }}>HABITS</span>
      <HabitChips rows={habits} day={data.day} canTick={data.d0 <= nowMs} />
      <span className="kl-sp" />
      <Totals data={data} />
    </div>
  );
  if (shape === 'clock') {
    return (
      <div data-testid="line-today" data-shape="clock">
        <div style={{ display: 'flex', gap: 40, alignItems: 'flex-start' }}>
          <DayClock data={data} nowMs={nowMs} size={440}>
            <div style={{ fontSize: 44, fontWeight: 500, letterSpacing: '-0.02em', lineHeight: 1 }}>{isToday ? fmtClock(nowMs) : data.day.slice(8)}</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 8 }}>{new Date(data.d0).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</div>
          </DayClock>
          <div style={{ flex: 1, minWidth: 0, marginTop: -14 }}><DayList board={board} data={data} nowMs={nowMs} isToday={isToday} /></div>
        </div>
        <div className="kl-sep" />
        {habitRow}
      </div>
    );
  }
  return (
    <div data-testid="line-today" data-shape="line">
      <DayLine data={data} nowMs={nowMs} range={range} ghost={ghost} />
      {habitRow}
      <div className="kl-sep" />
      <DayList board={board} data={data} nowMs={nowMs} isToday={isToday} />
    </div>
  );
}

export function WeekView({ board, day, nowMs, shape, onDay }: { board: Board | null; day: string; nowMs: number; shape: 'line' | 'clock'; onDay: (d: string) => void }) {
  const mon = mondayOf(day);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => dayData(board, addDaysYMD(mon, i), nowMs)), [board, mon, nowMs]);
  const habits = useMemo(() => habitRows(board, day), [board, day]);
  const range = useMemo(() => rangeFor(days), [days]);
  const isNow = (d: DayData): boolean => nowMs >= d.d0 && nowMs < d.d1;
  if (shape === 'clock') {
    return (
      <div data-testid="line-week" data-shape="clock" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 18 }}>
        {days.map((d, i) => (
          <div key={d.day} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: 10, borderRadius: 8, border: `1px solid ${isNow(d) ? 'var(--control-edge, var(--paper-3))' : 'transparent'}` }}>
            <button type="button" className="kl-wday" onClick={() => onDay(d.day)} style={{ color: isNow(d) ? 'var(--acid-ink, var(--acid))' : 'var(--ink-2)' }}>{WEEKDAYS[i]} <span style={{ color: 'var(--ink-4)' }}>{d.day.slice(8)}</span></button>
            <DayClock data={d} nowMs={nowMs} size={170} labels={false} />
            <Totals data={d} />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div data-testid="line-week" data-shape="line">
      <div className="kl-wrow" style={{ paddingTop: 0, paddingBottom: 0 }}>
        <span />
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, habits.length)}, 34px)`, justifyItems: 'center' }}>
          {habits.map((h) => <span key={h.id} title={h.name} style={{ fontSize: 9.5, color: 'var(--ink-3)', maxWidth: 34, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.name}</span>)}
        </div>
        <span className="kl-hdr" style={{ fontSize: 9.5 }}>the day in one line</span>
      </div>
      {days.map((d, i) => {
        const plans = d.plans.filter((p) => p.kind === 'plan');
        const done = plans.filter((p) => p.state === 'done').length;
        const open = plans.filter((p) => p.state === 'missed').length;
        return (
          <div key={d.day} className={`kl-wrow${isNow(d) ? ' kl-wrow--today' : ''}`} data-testid={`line-week-row-${d.day}`}>
            <DayLine data={d} nowMs={nowMs} range={range} size="compact" scale={i === 0} gutter={
              <button type="button" className="kl-wday" onClick={() => onDay(d.day)} title="Open this day" style={{ color: isNow(d) ? 'var(--acid-ink, var(--acid))' : 'var(--ink-2)' }}>{WEEKDAYS[i]} <span style={{ color: 'var(--ink-4)' }}>{d.day.slice(8)}</span></button>
            } />
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, habits.length)}, 34px)`, justifyItems: 'center' }}>
              {habits.map((h) => {
                const on = h.week[i] === true;
                return <button key={h.id} type="button" className="kl-hdot" data-testid={`line-week-habit-${h.id}-${d.day}`} aria-pressed={on} disabled={d.d0 > nowMs} title={`${h.name} · ${WEEKDAYS[i]}`} onClick={() => { void tickHabit(h, d.day); }} style={on ? { background: h.color, borderColor: h.color } : undefined} />;
              })}
            </div>
            <div style={{ minWidth: 0, lineHeight: 1.5 }}>
              <Totals data={d} wrap quiet={d.d0 > nowMs} />
              <div className="kl-dim" style={open > 0 ? { color: 'var(--rust)' } : undefined}>
                {plans.length === 0 ? 'nothing planned' : open > 0 ? `${open} plan${open === 1 ? '' : 's'} not answered` : `${done} of ${plans.length} plans done`}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** "every day", "Mon · Wed · Fri", "3 times a week", "8 glasses a day". */
export function scheduleWords(h: Habit): string {
  const t = weeklyTarget(h);
  const when = t ? `${t} times a week, any days`
    : !h.schedule || h.schedule.kind === 'daily' ? 'every day'
      : h.schedule.kind === 'weekdays' ? 'weekdays'
        : h.schedule.days.map((d) => WEEKDAYS[d - 1]).join(' · ');
  const at = h.schedule?.timeOfDay ? ` at ${h.schedule.timeOfDay}` : '';
  return h.amount ? `${h.amount.target} ${h.amount.unit} a day` : `${when}${at}`;
}

export function HabitsView({ board, day, nowMs }: { board: Board | null; day: string; nowMs: number }) {
  const all = habitsOf(board).filter((h) => !h.archived);
  const habits = all.filter((h) => h.kind !== 'routine');
  const events = all.filter((h) => h.kind === 'routine');
  const ym = day.slice(0, 7);
  const count = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate();
  const dates = Array.from({ length: count }, (_, i) => `${ym}-${String(i + 1).padStart(2, '0')}`);
  const today = new Date(nowMs);
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const cols = `minmax(170px, 260px) repeat(${count}, 26px) minmax(110px, 1fr)`;
  return (
    <div data-testid="line-habits-page">
      {habits.length === 0 && <div className="kl-dim" style={{ whiteSpace: 'normal', padding: '6px 0 14px' }}>No habits yet. Type one in the field below: "read every day", "gym mon wed fri", "water 8 glasses".</div>}
      <div className="kl-hgrid" style={{ gridTemplateColumns: cols, minWidth: 170 + count * 26 + 110 }}>
        <span className="kl-hdr">habit</span>
        {dates.map((d) => <span key={d} style={{ textAlign: 'center', fontSize: 9.5, color: d === todayStr ? 'var(--acid-ink, var(--acid))' : 'var(--ink-4)', fontWeight: d === todayStr ? 600 : 400 }}>{Number(d.slice(8))}</span>)}
        <span className="kl-hdr" style={{ textAlign: 'right' }}>streak</span>
        {habits.map((h) => {
          const color = `var(--${h.color})`;
          const streak = habitStreak(h, todayStr);
          const flexible = weeklyTarget(h) !== null;
          return [
            <div key={`${h.id}-n`} style={{ padding: '9px 0', borderTop: '1px solid color-mix(in srgb, var(--paper-3) 70%, transparent)', minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13.5 }}><span style={{ width: 12, height: 12, borderRadius: 4, background: color, flexShrink: 0 }} /><span style={{ overflowWrap: 'anywhere' }}>{h.name}</span></div>
              <div className="kl-dim" style={{ marginLeft: 21, marginTop: 2 }}>{scheduleWords(h)}</div>
            </div>,
            ...dates.map((d) => {
              const wrap = { borderTop: '1px solid color-mix(in srgb, var(--paper-3) 70%, transparent)', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', ...(d === todayStr ? { background: 'color-mix(in srgb, var(--acid) 7%, transparent)' } : {}) } as const;
              const done = h.log.includes(d);
              const rest = (h.rest ?? []).includes(d);
              const future = d > todayStr;
              const scheduled = flexible || isDayScheduled(h.schedule, d);
              const part = h.amount && !done ? Math.min(1, countOn(h, d) / Math.max(1, h.amount.target)) : 0;
              let cell: ReactNode;
              if (!scheduled && !done) cell = <span className="kl-cell kl-cell--off" />;
              else {
                const style = done ? { background: color, borderColor: color }
                  : part > 0 ? { borderColor: color, backgroundImage: `linear-gradient(to top, ${color} ${Math.round(part * 100)}%, transparent ${Math.round(part * 100)}%)` }
                    : undefined;
                cell = <button type="button" className={`kl-cell${rest && !done ? ' kl-cell--rest' : ''}`} data-testid={`line-cell-${h.id}-${d}`} aria-pressed={done} disabled={future} title={`${h.name} · ${d}${rest ? ' · rest day' : ''}`} onClick={() => { void tickHabit(h, d); }} style={style} />;
              }
              return <div key={`${h.id}-${d}`} style={wrap}>{cell}</div>;
            }),
            <div key={`${h.id}-s`} style={{ textAlign: 'right', borderTop: '1px solid color-mix(in srgb, var(--paper-3) 70%, transparent)', padding: '9px 0', whiteSpace: 'nowrap' }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>{streak.current} {streak.unit}{streak.current === 1 ? '' : 's'}</span>
              <div className="kl-dim">in a row · best {streak.best}</div>
            </div>,
          ];
        })}
      </div>
      {events.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', height: 26 }}><span className="kl-hdr">repeating events</span><span className="kl-sp" /><span className="kl-dim">on the line every week, never ticked</span></div>
          <div className="kl-hrow" style={{ marginTop: 6 }}>
            {events.map((h) => <span key={h.id} className="kl-hchip" style={{ cursor: 'default' }}>{h.name}<span className="kl-dim">{scheduleWords(h)}</span></span>)}
          </div>
        </div>
      )}
    </div>
  );
}
