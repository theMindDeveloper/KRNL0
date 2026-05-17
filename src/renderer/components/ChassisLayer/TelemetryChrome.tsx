/**
 * TelemetryChrome — mission-control chassis, wired to real KRNL state.
 *
 * Top row: 5 instrument cells (clock, signal waveform, carrier readout,
 * sys pressure gauge, downlink bars). Bottom row: 6 bays (one per mother),
 * a live event-log feed, and a side AOS/LOS panel.
 *
 * Wave-D wiring (Issue #134-style integration):
 *   - mission clock   — live HH:MM:SS
 *   - signal · live   — waveform plotted from last N event-log severities
 *   - carrier · MHz   — `nodes.edges` count rendered as a faux frequency
 *   - sys pressure    — today's task completion ratio (gauge fills, colors)
 *   - downlink        — best habit streak (0–5 bars)
 *   - bays            — per-mother live counter; click jumps the camera
 *   - transmission log— last 3 event-log entries (live ts + severity color)
 *   - aos · los       — running pomo time remaining; otherwise app uptime
 */

import { useEffect, useMemo, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useBoardStore } from '../../store/boardStore';
import { useEventLog } from '../../store/eventLog';
import { useAnalytics, lastNDays } from '../../analytics';
import type { PomoState } from '../nodes/PomoNode/types';
import type { EventSeverity } from '../../store/eventLog/types';

const APP_BOOT_TS = Date.now();

function pad(n: number, w = 2): string { return n.toString().padStart(w, '0'); }

function fmtMinSec(ms: number): string {
  if (ms <= 0) return '--:--';
  const s = Math.floor(ms / 1000);
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}

function severityToHeight(sev: EventSeverity, idx: number): number {
  // Base height 16, with severity-driven spikes for "signal" feel.
  const base = 16 + Math.sin(idx * 0.7) * 0.9;
  const spike =
    sev === 'err' ? -10 :
    sev === 'warn' ? -5 :
    sev === 'info' ? 2 :
    0;
  return base + spike;
}

export function TelemetryChrome() {
  const rf = useReactFlow();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const board = useBoardStore((s) => s.board);
  const entries = useEventLog((s) => s.entries);
  const analytics = useAnalytics();

  const hh = pad(now.getHours());
  const mm = pad(now.getMinutes());
  const ss = pad(now.getSeconds());

  // ── Cell 02 — signal waveform from the most recent 80 event entries ───
  const wave = useMemo(() => {
    const N = 80;
    const tail = entries.slice(-N);
    const pts: string[] = [];
    for (let i = 0; i < N; i++) {
      const e = tail[i] ?? null;
      const sev: EventSeverity = e?.severity ?? 'ok';
      const y = severityToHeight(sev, i);
      const t = i / (N - 1);
      pts.push(`${t * 100},${y}`);
    }
    return pts.join(' ');
  }, [entries]);

  // ── Cell 03 — carrier "frequency" derived from node + edge count ──────
  const nodeCount = board?.nodes.length ?? 0;
  const edgeCount = board?.edges.length ?? 0;
  const carrier = `${pad(nodeCount, 4)}.${pad(edgeCount, 2)}`;

  // ── Cell 04 — sys pressure: today's task completion ratio ─────────────
  const open = analytics.open();
  const todayTotals = analytics.totals(lastNDays(1));
  const totalTasks = open.tasksTotal;
  const doneToday = todayTotals.tasksDone;
  const pressurePct = totalTasks === 0
    ? 0
    : Math.round(((totalTasks - open.tasksOpen) / totalTasks) * 100);
  const pressureLabel =
    pressurePct >= 80 ? 'nominal' :
    pressurePct >= 40 ? 'moderate' :
    'low';

  // ── Cell 05 — downlink: best habit streak, capped to 5 bars ───────────
  const streaks = analytics.streaks();
  const downlinkBars = Math.min(5, streaks.longestHabitStreak);

  // ── Bays — per-mother live counter ────────────────────────────────────
  const mothers = useMemo(() => (board?.nodes ?? []).filter((n) => n.isMother), [board]);
  const motherById = useMemo(() => {
    const m: Record<string, (typeof mothers)[number]> = {};
    for (const x of mothers) m[x.kind] = x;
    return m;
  }, [mothers]);

  const pomoSessionsToday = todayTotals.sessions;
  const todoOpen = open.tasksOpen;
  const habitBest = streaks.longestHabitStreak;
  const calendarTodayEvents = todayTotals.tasksDone + todayTotals.habitCheckins;

  const bays = [
    { kind: 'pomo',     id: 'bay 01 · pomo',  name: 'DEEP WORK',  metric: `${pomoSessionsToday}`,        sub: 'sessions today',  warn: false },
    { kind: 'todo',     id: 'bay 02 · todo',  name: 'CHAIN',      metric: `${todoOpen}`,                 sub: 'open',            warn: todoOpen > 20 },
    { kind: 'habit',    id: 'bay 03 · habit', name: 'STREAK',     metric: `${habitBest}d`,               sub: 'best',            warn: habitBest === 0 },
    { kind: 'terminal', id: 'bay 04 · term',  name: 'KERNEL',     metric: 'IDLE',                        sub: 'shell',           warn: false },
    { kind: 'calendar', id: 'bay 05 · cal',   name: 'SCHEDULE',   metric: `${calendarTodayEvents}`,      sub: 'events today',    warn: false },
    { kind: 'clock',    id: 'bay 06 · clock', name: 'UPTIME',     metric: fmtMinSec(now.getTime() - APP_BOOT_TS), sub: 'session', warn: false },
  ];

  // Click a bay → center the viewport on the corresponding mother.
  const jumpTo = (kind: string) => {
    const m = motherById[kind];
    if (!m) return;
    // Mother is 540×540; aim at center.
    rf.setCenter?.(m.position.x + 270, m.position.y + 270, { zoom: 1, duration: 380 });
  };

  // ── AOS·LOS — pomo time remaining, or boot uptime fallback ────────────
  const runningPomo = mothers
    .map((m) => m.state as PomoState | undefined)
    .find((s) => s?.status === 'running' && s.startedAt !== null);
  let aosLabel = 'aos · los';
  let aosBig = fmtMinSec(now.getTime() - APP_BOOT_TS);
  if (runningPomo && runningPomo.startedAt) {
    const elapsed = now.getTime() - Date.parse(runningPomo.startedAt) - (runningPomo.pausedElapsedMs ?? 0);
    const remaining = runningPomo.durationMin * 60_000 - elapsed;
    aosLabel = 'pomo · t-minus';
    aosBig = fmtMinSec(remaining);
  }

  // ── Transmission log — last 3 entries from the event log ──────────────
  const recent = entries.slice(-3).reverse();

  return (
    <>
      <div className="md-tel-top">
        {/* 01 — Mission clock */}
        <div className="md-tel-cell">
          <div className="k"><span className="num">01</span><span>mission clock</span></div>
          <div className="v">
            {hh}<span className="colon">:</span>{mm}<span className="colon">:</span>{ss}
          </div>
          <div className="sub">utc · live</div>
        </div>

        {/* 02 — Signal waveform from event log */}
        <div className="md-tel-cell md-tel-wave">
          <div className="k"><span className="num">02</span><span>signal · {entries.length}/200</span></div>
          <div className="grid" />
          <svg viewBox="0 0 100 32" preserveAspectRatio="none" style={{ marginTop: 6 }}>
            <polyline
              className="md-tel-wave-line"
              points={wave}
              fill="none"
              strokeWidth="0.7"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>

        {/* 03 — Carrier (nodes.edges) */}
        <div className="md-tel-cell">
          <div className="k"><span className="num">03</span><span>carrier · MHz</span></div>
          <div className="v rust">{carrier.split('.')[0]}<span className="flick">.</span>{carrier.split('.')[1]}</div>
          <div className="sub">{nodeCount}n · {edgeCount}e</div>
        </div>

        {/* 04 — Sys pressure gauge */}
        <div className="md-tel-cell">
          <div className="k"><span className="num">04</span><span>sys pressure</span></div>
          <div className="md-tel-gauge" style={{ marginTop: 8 }}>
            <div
              className="track"
              style={{ ['--fill' as string]: `${pressurePct}%` } as React.CSSProperties}
            />
            <div className="ticks">
              <span>0</span><span>·</span><span>·</span><span>·</span><span>{pressurePct}</span>
            </div>
          </div>
          <div className="sub" style={{ marginTop: 6 }}>{pressureLabel} · {pressurePct}%</div>
        </div>

        {/* 05 — Downlink (streak bars) */}
        <div className="md-tel-cell">
          <div className="k"><span className="num">05</span><span>downlink</span></div>
          <div className="md-tel-bars">
            {Array.from({ length: 5 }).map((_, i) => (
              <span key={i} data-on={i < downlinkBars ? 'true' : 'false'} />
            ))}
          </div>
          <div className="sub" style={{ marginTop: 4 }}>{doneToday} today</div>
        </div>
      </div>

      <div className="md-tel-bot">
        <div className="md-tel-bays">
          {bays.map((b) => (
            <button
              key={b.kind}
              type="button"
              className={`md-tel-bay md-tel-bay-interactive${b.warn ? ' warn' : ''}`}
              title={`Jump to ${b.kind} mother`}
              onClick={() => jumpTo(b.kind)}
            >
              <div className="id">{b.id}</div>
              <div className="name">{b.name}</div>
              <div className="meter" />
              <div className="bay-metric">{b.metric}<span className="bay-sub"> {b.sub}</span></div>
            </button>
          ))}
        </div>

        <div className="md-tel-log">
          <div className="head">transmission log · KRNL-0</div>
          {recent.length === 0 && (
            <div className="row" style={{ opacity: 0.5 }}>
              <span className="ts">{hh}:{mm}:{ss}</span>system idle · awaiting telemetry
            </div>
          )}
          {recent.map((e) => {
            const d = new Date(e.ts);
            return (
              <div
                key={e.id}
                className={`row${e.severity === 'err' || e.severity === 'warn' ? ' tel-sev-warn' : ''}`}
              >
                <span className="ts">{pad(d.getHours())}:{pad(d.getMinutes())}:{pad(d.getSeconds())}</span>
                {e.text}
              </div>
            );
          })}
        </div>

        <div className="md-tel-side">
          <div className="head">{aosLabel}</div>
          <div className="big">{aosBig}</div>
          <div className="row">
            <span>{runningPomo ? 'live' : 'idle'}</span>
            <a
              className="md-tel-credit"
              href="https://github.com/theMindDeveloper"
              target="_blank"
              rel="noreferrer noopener"
              title="theMindDeveloper on GitHub"
            >
              @theMind
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
