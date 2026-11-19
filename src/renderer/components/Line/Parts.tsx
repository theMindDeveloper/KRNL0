// The parts every Line screen shares: what you are doing (NowBand), the one
// field that adds anything (CommandField), habits to tick (HabitChips).

import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import type { Board } from '../../../shared/types';
import { LineGlyph } from '../ui/LineGlyph';
import { fmtClock, fmtDur, pomoOf, type DayData, type HabitRow, type PlanMark } from './dayData';
import { addHabit, addPlainPlan, addPlan, backToWork, readField, startRecording, stopRecording, takeBreak, tickHabit, type FieldIntent } from './lineActions';

const mmss = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
};

export function NowBand({ board, today, next, compact = false }: { board: Board | null; today: DayData; next: PlanMark | null; compact?: boolean }) {
  const ps = pomoOf(board);
  const status = ps?.status ?? 'idle';
  const live = (status === 'running' || status === 'break') && !!ps?.startedAt;
  // The running time ticks by itself; the rest of the screen follows the slower clock.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [live]);
  const liveMark = today.real.find((r) => r.live);
  const elapsed = live && ps?.startedAt ? now - Date.parse(ps.startedAt) : 0;
  const nextText = next
    ? next.startMs <= now ? `${next.text} until ${fmtClock(next.endMs)}` : `${next.text} at ${fmtClock(next.startMs)}`
    : null;
  const nextIn = next && next.startMs > now ? `in ${fmtDur(next.startMs - now)}` : next ? 'now' : null;

  return (
    <div className={`kl-now${compact ? ' kl-now--compact' : ''}`} data-testid="line-now-band" data-status={status}>
      <div style={{ minWidth: 0, flex: '0 1 auto' }}>
        {!compact && (
          <div className="kl-hdr" style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: status === 'running' ? 'var(--cyan)' : 'var(--ink-4)', display: 'inline-block' }} />
            {status === 'running' ? 'recording now' : status === 'break' ? 'on a break' : status === 'paused' ? 'paused' : 'not recording'}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, minWidth: 0 }}>
          <span className="kl-act" data-testid="line-now-label">
            {status === 'running' ? liveMark?.label ?? 'Recording' : status === 'break' ? 'Break' : status === 'paused' ? 'Paused' : 'What are you doing?'}
          </span>
          {live && <span className="kl-tm" data-testid="line-now-time">{mmss(elapsed)}</span>}
        </div>
      </div>
      <span className="kl-sp" />
      {nextText && (
        <div className="kl-next" data-testid="line-next">
          {!compact && <div className="kl-hdr">next</div>}
          <div style={{ color: 'var(--ink)' }}>{compact ? `next: ${nextText}` : nextText}</div>
          {!compact && <div>{nextIn}</div>}
        </div>
      )}
      {status === 'running' && <button type="button" className="kl-btn" data-testid="line-break" onClick={() => { void takeBreak(); }}>Break</button>}
      {status === 'break' && <button type="button" className="kl-btn" data-testid="line-back" onClick={() => { void backToWork(); }}>Back to work</button>}
      {status === 'paused' && <button type="button" className="kl-btn" data-testid="line-resume" onClick={() => { void backToWork(); }}>Resume</button>}
      {status === 'idle' || status === 'done'
        ? <button type="button" className="kl-btn kl-btn--p" data-testid="line-start" style={{ height: 36, padding: '0 22px' }} onClick={() => { void startRecording(''); }}><LineGlyph name="play" size={11} /> Start</button>
        : <button type="button" className="kl-btn kl-btn--p" data-testid="line-stop" style={{ height: 36, padding: '0 22px' }} onClick={() => { void stopRecording(); }}>Stop</button>}
    </div>
  );
}

export function HabitChips({ rows, day, canTick }: { rows: HabitRow[]; day: string; canTick: boolean }) {
  if (rows.length === 0) return <span className="kl-dim">No habits yet. Type one below, like "walk daily".</span>;
  return (
    <div className="kl-hrow" data-testid="line-habits">
      {rows.map((h) => (
        <button
          key={h.id}
          type="button"
          className="kl-hchip"
          data-testid={`line-habit-${h.id}`}
          aria-pressed={h.done}
          disabled={!canTick}
          title={h.amount ? `${h.name}: click to add one` : h.done ? `${h.name}: done. Click to untick` : `${h.name}: click to tick`}
          onClick={() => { void tickHabit(h, day); }}
        >
          <span className="kl-box" style={{ color: h.color, background: h.done ? h.color : 'transparent' }} />
          <span style={{ fontSize: 12.5 }}>{h.name}</span>
          <span className="kl-dim">{h.status}</span>
          <span className="kl-dots" aria-hidden>
            {h.week.map((d, i) => <i key={i} style={{ ...(d ? { background: h.color } : {}), ...(h.weekDays[i] === day ? { outline: '1px solid var(--ink-3)', outlineOffset: 1.5 } : {}) }} />)}
          </span>
        </button>
      ))}
    </div>
  );
}

/** What Enter will do, in words. */
function says(i: FieldIntent, recording: boolean): { main: string; other: string | null } {
  switch (i.kind) {
    case 'record': return { main: recording ? `switch to recording "${i.label}"` : `start recording "${i.label}"`, other: 'add it as a plan with no time' };
    case 'plan': {
      const q = i.q;
      const when = [q.day, q.time, q.durationMin ? fmtDur(q.durationMin * 60_000) : null, q.deadline ? `by ${q.deadline}` : null].filter(Boolean).join(' · ');
      return { main: `add the plan "${q.text}"${when ? `: ${when}` : ''}`, other: null };
    }
    case 'habit': return { main: `add the habit "${i.habit.name}": ${i.habit.says}`, other: null };
    case 'hint': return { main: i.text, other: null };
    default: return { main: '', other: null };
  }
}

export function CommandField({ recording, onIntent }: { recording: boolean; onIntent: (i: FieldIntent) => void }) {
  const [text, setText] = useState('');
  const intent = useMemo(() => readField(text), [text]);
  useEffect(() => { onIntent(intent); }, [intent, onIntent]);
  const s = says(intent, recording);
  const clear = (): void => setText('');
  const submit = (alt: boolean): void => {
    if (intent.kind === 'record') {
      if (alt) void addPlainPlan(intent.label); else void startRecording(intent.label);
    } else if (intent.kind === 'plan') void addPlan(intent.q);
    else if (intent.kind === 'habit') void addHabit(intent.habit);
    else return;
    clear();
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') { e.preventDefault(); submit(e.shiftKey); } else if (e.key === 'Escape') { clear(); e.currentTarget.blur(); }
    // Typing here never reaches the board's own shortcuts.
    e.stopPropagation();
  };
  return (
    <div className="kl-cmd-wrap">
      {intent.kind !== 'empty' && (
        <div className="kl-says" data-testid="line-says" role="status">
          <span className="kl-tok">Enter</span><span>{s.main}</span>
          {s.other && <><span className="kl-tok" style={{ marginLeft: 10 }}>Shift + Enter</span><span>{s.other}</span></>}
        </div>
      )}
      <div className="kl-cmd">
        <span style={{ color: 'var(--acid-ink, var(--acid))', fontWeight: 600 }}>›</span>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          placeholder="What are you doing, or what will you do?"
          aria-label="Record something, add a plan or a habit"
          data-testid="line-field"
        />
        {text === '' && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }} aria-hidden>
            <span className="kl-tok">study</span><span className="kl-dim">records</span>
            <span className="kl-tok">gym 18:00 1h</span><span className="kl-dim">plans</span>
            <span className="kl-tok">walk daily</span><span className="kl-dim">adds a habit</span>
          </span>
        )}
      </div>
    </div>
  );
}
