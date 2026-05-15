import { useMemo } from 'react';
import type { NodeProps } from '../types';
import type { ClockState, ClockConfig } from './types';
import { todayLocalYMD } from './types';
import { MotherFrame, MOTHER_WIDTH, MOTHER_TOTAL } from '../MotherFrame';
import { useBoardStore } from '../../../store/boardStore';
import { selectTimeline } from '../../../store/timelineSelector';
import { selectSchedule } from '../../../store/scheduleSelector';
import { useTick } from '../../../hooks/useTick';
import type { TaskState } from '../TaskNode/types';

// ADR 0004 §4 — concentric parallel rings.
const R = 108;
// ADR 0004 §3.5 — break ring sits inside the task ring so a back-to-back
// successor task (at radius R) cannot eclipse a break that shares the same
// wall-clock minutes.
const BREAK_R = R - 16;
const PARALLEL_OFFSET = 12;
const CIRCUMFERENCE = 2 * Math.PI * R;
const BREAK_CIRCUMFERENCE = 2 * Math.PI * BREAK_R;
const TOTAL_MIN = 720;
const DAY_MIN = 1440;

// Decision 24.2 — palette is constrained to tokens defined in src/renderer/styles/tokens.css.
// Adding a name here without a matching `--<name>` definition will cause break arcs to paint nothing.
// Index 0 = long break (strongest ink), Index 1 = short break (medium ink).
export const BREAK_TOKENS = ['ink-2', 'ink-3'] as const;

const COLOR_PALETTE = ['rose', 'amber', 'teal', 'lilac', 'sand', 'moss'] as const;

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** Deterministic colour for a task arc — stable for a given taskId. */
function colorFor(taskId: string): string {
  let h = 0;
  for (let i = 0; i < taskId.length; i++) h = (h * 31 + taskId.charCodeAt(i)) >>> 0;
  return COLOR_PALETTE[h % COLOR_PALETTE.length]!;
}

/** Parse a "YYYY-MM-DDTHH:MM" local-ISO into minutes-of-day. */
function minutesOfDay(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return null;
  const hh = Number.parseInt(m[4]!, 10);
  const mm = Number.parseInt(m[5]!, 10);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
}

/** Local weekday abbreviation for a YYYY-MM-DD string. */
function weekdayShortOf(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return '';
  const d = new Date(
    Number.parseInt(m[1]!, 10),
    Number.parseInt(m[2]!, 10) - 1,
    Number.parseInt(m[3]!, 10),
  );
  return WEEKDAY_SHORT[d.getDay()] ?? '';
}

/** Next YYYY-MM-DD via local Date arithmetic. */
function nextDayYMD(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  const d = new Date(
    Number.parseInt(m[1]!, 10),
    Number.parseInt(m[2]!, 10) - 1,
    Number.parseInt(m[3]!, 10),
  );
  d.setDate(d.getDate() + 1);
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function ClockNode({
  node,
  onCommand,
  slotIndex = 6,
  slotTotal = MOTHER_TOTAL,
  onMoveLeft,
  onMoveRight,
}: NodeProps<ClockState, ClockConfig>) {
  const { linkedTodoId, viewWindow, selectedDate } = node.state;

  // Subscribe to the board reference. Zustand replaces this on any
  // mutation; downstream selectors are memoized at module level.
  const board = useBoardStore((s) => s.board);

  // Todo dropdown list — primitive-derived, recomputed only when board.nodes
  // changes.
  const todoNodes = useMemo(() => {
    if (!board) return [] as Array<{ id: string }>;
    return board.nodes
      .filter((n) => n.kind === 'todo')
      .map((n) => ({ id: n.id }));
  }, [board?.nodes]);

  // ADR 0004 §3.5 — break shapes from selectTimeline (Calendar drops breaks;
  // Clock keeps them — divergence is the binding decision).
  const timeline = useMemo(
    () => (board && linkedTodoId ? selectTimeline(board, linkedTodoId) : null),
    [board, linkedTodoId],
  );

  // ADR 0004 §3.4 — full placements Map from the memoized selector. The
  // Map is reference-stable on (nodes, edges) reference identity.
  const placementsMap = useMemo(() => {
    if (!board) return null;
    return selectSchedule(board).placements;
  }, [board]);

  // Task info index — built once per nodes change. Used both to filter
  // placements by parentTodoId and to look up done/plannedMin in the arc loop.
  const taskInfo = useMemo(() => {
    const m = new Map<
      string,
      { done: boolean; plannedMin: number; parentTodoId: string }
    >();
    if (!board) return m;
    for (const n of board.nodes) {
      if (n.kind !== 'todo.task') continue;
      const ts = n.state as TaskState;
      m.set(n.id, {
        done: ts.done,
        plannedMin: ts.plannedMin ?? ts.durationMin,
        parentTodoId: ts.parentTodoId,
      });
    }
    return m;
  }, [board?.nodes]);

  // ADR 0004 §3.7 — viewWindow toggle is always enabled. No auto-flip.
  const windowStart = viewWindow * TOTAL_MIN;
  const windowEnd = windowStart + TOTAL_MIN;

  // ADR 0004 §3.4 — derive each placement's [startMinOfDay, endMinOfDay)
  // and clip to the current 12h window. Tasks starting BEFORE the selected
  // day are omitted; tasks ending after midnight clip at 1440.
  const arcs = (() => {
    if (!placementsMap || !linkedTodoId) return [];
    const out: Array<{
      taskId: string;
      parallelGroupId: string | null;
      parallelBranchIndex: number | null;
      arcLength: number;
      startOffset: number;
      // PR5 — wall-clock window of the arc, for active-arc detection vs nowMinOfDay
      windowStartMin: number;
      windowEndMin: number;
    }> = [];
    for (const p of placementsMap.values()) {
      if (taskInfo.get(p.taskId)?.parentTodoId !== linkedTodoId) continue;
      const startDate = p.startISO.slice(0, 10);
      const endDate = p.endISO.slice(0, 10);
      if (startDate < selectedDate) continue;
      if (startDate > selectedDate) continue;
      const startMin = minutesOfDay(p.startISO);
      if (startMin === null) continue;
      let endMin: number;
      if (endDate > selectedDate) {
        endMin = DAY_MIN;
      } else {
        const e = minutesOfDay(p.endISO);
        if (e === null) continue;
        endMin = e;
      }
      if (endMin <= startMin) continue;

      const winStart = Math.max(startMin, windowStart);
      const winEnd = Math.min(endMin, windowEnd);
      if (winEnd <= winStart) continue;

      const arcLengthMin = winEnd - winStart;
      const offsetMin = winStart - windowStart;
      const arcLength = (arcLengthMin / TOTAL_MIN) * CIRCUMFERENCE;
      const startOffset = (offsetMin / TOTAL_MIN) * CIRCUMFERENCE;

      out.push({
        taskId: p.taskId,
        parallelGroupId: p.parallelGroupId,
        parallelBranchIndex: p.parallelBranchIndex,
        arcLength,
        startOffset,
        windowStartMin: winStart,
        windowEndMin: winEnd,
      });
    }
    return out;
  })();

  // ADR 0004 §3.5 — break arcs: project each timeline break onto the wall
  // clock via its predecessor's placement.endISO. Breaks whose predecessor
  // is absent (different day or unanchored) are skipped.
  const breakArcs = (() => {
    if (!placementsMap || !timeline) return [];
    const out: Array<{
      breakId: string;
      breakKind: 'short' | 'long';
      durationMin: number;
      arcLength: number;
      startOffset: number;
    }> = [];
    for (const seg of timeline.segments) {
      if (seg.kind !== 'break') continue;
      const pred = placementsMap.get(seg.afterTaskId);
      if (!pred) continue;
      const breakStartDate = pred.endISO.slice(0, 10);
      if (breakStartDate !== selectedDate) continue;
      const breakStartMin = minutesOfDay(pred.endISO);
      if (breakStartMin === null) continue;
      const durationMin = Math.max(0, seg.endMin - seg.startMin);
      const breakEndMin = Math.min(DAY_MIN, breakStartMin + durationMin);
      if (breakEndMin <= breakStartMin) continue;

      const winStart = Math.max(breakStartMin, windowStart);
      const winEnd = Math.min(breakEndMin, windowEnd);
      if (winEnd <= winStart) continue;

      const arcLengthMin = winEnd - winStart;
      const offsetMin = winStart - windowStart;
      const arcLength = (arcLengthMin / TOTAL_MIN) * BREAK_CIRCUMFERENCE;
      const startOffset = (offsetMin / TOTAL_MIN) * BREAK_CIRCUMFERENCE;

      out.push({
        breakId: seg.breakId,
        breakKind: seg.breakKind,
        durationMin,
        arcLength,
        startOffset,
      });
    }
    return out;
  })();

  // ADR 0004 §3.4 — 12 tick marks; hour labels are wall-clock derived.
  const ticks = Array.from({ length: 12 }, (_, i) => {
    const angleDeg = i * 30 - 90; // -90 puts i=0 at top
    const angleRad = (angleDeg * Math.PI) / 180;
    const innerR = 122;
    const outerR = 132;
    const labelR = 143;
    const x1 = 150 + innerR * Math.cos(angleRad);
    const y1 = 150 + innerR * Math.sin(angleRad);
    const x2 = 150 + outerR * Math.cos(angleRad);
    const y2 = 150 + outerR * Math.sin(angleRad);
    const lx = 150 + labelR * Math.cos(angleRad);
    const ly = 150 + labelR * Math.sin(angleRad);
    const hour = viewWindow * 12 + i;
    const label = String(hour);
    return { x1, y1, x2, y2, lx, ly, label, isTop: i === 0 };
  });

  const controlBtnStyle: React.CSSProperties = {
    fontSize: 13,
    lineHeight: 1,
    color: 'var(--ink)',
    background: 'none',
    border: '1px solid var(--paper-3)',
    borderRadius: 3,
    cursor: 'pointer',
    padding: '1px 6px',
    fontFamily: 'var(--font-mono)',
  };

  const navBtnStyle: React.CSSProperties = {
    background: 'transparent',
    border: 'none',
    color: 'var(--ink-3)',
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    cursor: 'pointer',
    padding: '2px 6px',
    borderRadius: 3,
    lineHeight: 1,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    color: 'var(--ink-2)',
    fontFamily: 'var(--font-mono)',
  };

  void nextDayYMD; // reserved for future range computations (not used directly).

  const isToday = selectedDate === todayLocalYMD();
  const weekday = weekdayShortOf(selectedDate);
  const isEmpty = linkedTodoId !== null && arcs.length === 0;

  // PR5 — live time elements. useTick is a singleton 500ms shared interval;
  // calling it here adds no new timer. The component already re-renders on
  // every board mutation, so the tick is a small additional driver. The
  // returned value is discarded — its only purpose is to subscribe so the
  // component re-renders periodically.
  void useTick();
  const now = new Date();
  const nowHours = now.getHours();
  const nowMins = now.getMinutes();
  const nowMinOfDay = nowHours * 60 + nowMins;
  // Hands and "now" notch are gated on viewing today AND the current minute
  // falling inside the displayed 12h window.
  const showLiveHands = isToday && nowMinOfDay >= windowStart && nowMinOfDay < windowEnd;
  const hourFrac = (nowMinOfDay - windowStart) / TOTAL_MIN;
  const minFrac = nowMins / 60;
  // SVG: top = -π/2, clockwise positive. (frac * 2π) - π/2.
  const hourAngleRad = hourFrac * 2 * Math.PI - Math.PI / 2;
  const minAngleRad = minFrac * 2 * Math.PI - Math.PI / 2;
  const meridiem = nowHours < 12 ? 'AM' : 'PM';
  const nowLocalStr = `${String(nowHours).padStart(2, '0')}:${String(nowMins).padStart(2, '0')}`;

  return (
    <MotherFrame
      slotIndex={slotIndex}
      slotTotal={slotTotal}
      width={MOTHER_WIDTH}
      onMoveLeft={onMoveLeft}
      onMoveRight={onMoveRight}
    >
      <div
        style={{
          padding: '10px 14px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {/* Header — wall-clock half-day range label */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontFamily: 'var(--font-mono)',
              color: 'var(--ink-2)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            {`CLOCK · ${viewWindow * 12}–${(viewWindow + 1) * 12}H`}
          </span>
        </div>

        {/* ADR 0004 §3.3 — day-selector sub-header */}
        <div
          data-testid="clock-day-selector"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <button
            type="button"
            data-testid="clock-day-prev"
            onClick={() => onCommand('clock.advanceDay', { delta: -1 })}
            style={navBtnStyle}
          >
            ←
          </button>
          <span
            data-testid="clock-day-label"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--ink-1)',
              letterSpacing: '0.06em',
            }}
          >
            {`${weekday} ${selectedDate}`}
          </span>
          <button
            type="button"
            data-testid="clock-day-today"
            onClick={() => {
              if (!isToday) onCommand('clock.goToday');
            }}
            disabled={isToday}
            style={{
              ...controlBtnStyle,
              opacity: isToday ? 0.4 : 1,
              cursor: isToday ? 'not-allowed' : 'pointer',
            }}
          >
            TODAY
          </button>
          <button
            type="button"
            data-testid="clock-day-next"
            onClick={() => onCommand('clock.advanceDay', { delta: 1 })}
            style={navBtnStyle}
          >
            →
          </button>
        </div>

        {/* Link UI */}
        {linkedTodoId === null ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={labelStyle}>Link Todo:</span>
            <select
              style={{
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
                background: 'var(--paper-2)',
                border: '1px solid var(--paper-3)',
                borderRadius: 4,
                color: 'var(--ink)',
                padding: '2px 6px',
                cursor: 'pointer',
              }}
              defaultValue=""
              onChange={(e) => {
                const val = e.target.value;
                if (val) onCommand('clock.linkTodo', { todoNodeId: val });
              }}
            >
              <option value="" disabled>
                — pick a todo —
              </option>
              {todoNodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.id.slice(-8)}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={labelStyle}>Todo:</span>
            <span
              style={{
                fontSize: 11,
                color: 'var(--ink)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {linkedTodoId.slice(-8)}
            </span>
            <button
              type="button"
              style={{
                fontSize: 11,
                color: 'var(--ink-2)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '0 2px',
                lineHeight: 1,
              }}
              title="Unlink todo"
              onClick={() => onCommand('clock.linkTodo', { todoNodeId: null })}
            >
              ×
            </button>
          </div>
        )}

        {/* SVG clock face — 300×300, center (150,150) */}
        <svg
          width={300}
          height={300}
          viewBox="0 0 300 300"
          style={{ display: 'block', margin: '0 auto' }}
        >
          {/* Outer background ring */}
          <circle
            cx={150}
            cy={150}
            r={130}
            fill="var(--paper-2)"
            stroke="var(--paper-3)"
            strokeWidth={1}
          />

          {/* ADR 0004 §3.5 — break arcs (inner ring at BREAK_R = R - 16) */}
          {breakArcs.map(({ breakId, breakKind, durationMin, arcLength, startOffset }) => {
            const isLong = breakKind === 'long';
            const strokeColor = isLong
              ? `var(--${BREAK_TOKENS[0]})`
              : `var(--${BREAK_TOKENS[1]})`;
            const strokeW = isLong ? 10 : 6;
            const kindLabel = isLong ? 'long break' : 'short break';
            return (
              <g key={`${breakId}-w${viewWindow}-${selectedDate}`}>
                <title>{`${kindLabel} · ${durationMin}m`}</title>
                <circle
                  cx={150}
                  cy={150}
                  r={BREAK_R}
                  fill="transparent"
                  stroke={strokeColor}
                  strokeWidth={strokeW}
                  strokeDasharray={`${arcLength} ${BREAK_CIRCUMFERENCE}`}
                  strokeDashoffset={-startOffset}
                  transform="rotate(-90 150 150)"
                  opacity={1}
                />
              </g>
            );
          })}

          {/* ADR 0004 §4 — Task arcs with concentric parallel rings.
              PR5 — active arc (the one wall-clock-now intersects) pulses via
              the `clock-arc-pulse` keyframe (defined in tokens.css PR1). */}
          {arcs.map((a) => {
            const isParallel = a.parallelGroupId !== null;
            const branchIdx = a.parallelBranchIndex ?? 0;
            const clampedIdx = Math.min(branchIdx, 3); // 4+ collapse to innermost
            const radius = isParallel ? R + clampedIdx * PARALLEL_OFFSET : R;
            const strokeW = isParallel ? 10 : 18;
            const useMultiply = isParallel && branchIdx >= 4;

            const info = taskInfo.get(a.taskId);
            const done = info?.done === true;
            const colorToken = colorFor(a.taskId);

            // Per-arc circumference matches the radius the arc lives on.
            const arcCircumference = 2 * Math.PI * radius;
            const scaledArcLength = (a.arcLength / CIRCUMFERENCE) * arcCircumference;
            const scaledStartOffset = (a.startOffset / CIRCUMFERENCE) * arcCircumference;

            const isActive =
              showLiveHands
              && !done
              && nowMinOfDay >= a.windowStartMin
              && nowMinOfDay < a.windowEndMin;

            const arcStyle: React.CSSProperties = {};
            if (useMultiply) arcStyle.mixBlendMode = 'multiply' as const;
            if (isActive) arcStyle.animation = 'clock-arc-pulse 2.4s ease-in-out infinite';

            return (
              <g key={`${a.taskId}-w${viewWindow}-${selectedDate}`}>
                <title>{`task ${a.taskId.slice(-8)} · ${info?.plannedMin ?? 0}m`}</title>
                <circle
                  cx={150}
                  cy={150}
                  r={radius}
                  fill="transparent"
                  stroke={`var(--${colorToken}, #c87080)`}
                  strokeWidth={strokeW}
                  strokeDasharray={`${scaledArcLength} ${arcCircumference}`}
                  strokeDashoffset={-scaledStartOffset}
                  transform="rotate(-90 150 150)"
                  opacity={done ? 0.4 : 1}
                  style={Object.keys(arcStyle).length > 0 ? arcStyle : undefined}
                />
              </g>
            );
          })}

          {/* Tick marks + hour labels */}
          {ticks.map((t, i) => (
            <g key={i}>
              <line
                x1={t.x1}
                y1={t.y1}
                x2={t.x2}
                y2={t.y2}
                stroke="var(--ink-2)"
                strokeWidth={t.isTop ? 2 : 1}
              />
              <text
                x={t.lx}
                y={t.ly}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={9}
                fill="var(--ink-2)"
                fontFamily="var(--font-mono)"
              >
                {t.label}
              </text>
            </g>
          ))}

          {/* PR5 — Live time elements (only when viewing today). The minute
              and hour hands snap once per minute; useTick (500ms) just
              keeps the component subscribed so it picks up the change
              without a per-component setInterval. */}
          {showLiveHands && (
            <>
              {/* "Now" notch on the outer ring — rust marker at the current
                  wall-clock position. */}
              <line
                x1={150 + Math.cos(hourAngleRad) * (R - 6)}
                y1={150 + Math.sin(hourAngleRad) * (R - 6)}
                x2={150 + Math.cos(hourAngleRad) * (R + 14)}
                y2={150 + Math.sin(hourAngleRad) * (R + 14)}
                stroke="var(--rust)"
                strokeWidth={2.5}
                strokeLinecap="round"
              />
              {/* Hour hand — shorter, thicker. Inks at full strength so it
                  reads against the arc colors. */}
              <line
                x1={150}
                y1={150}
                x2={150 + Math.cos(hourAngleRad) * 50}
                y2={150 + Math.sin(hourAngleRad) * 50}
                stroke="var(--ink)"
                strokeWidth={4}
                strokeLinecap="round"
                style={{ transition: 'transform 0.4s cubic-bezier(.4,2.3,.6,1)' }}
              />
              {/* Minute hand — longer, thinner. */}
              <line
                x1={150}
                y1={150}
                x2={150 + Math.cos(minAngleRad) * 85}
                y2={150 + Math.sin(minAngleRad) * 85}
                stroke="var(--ink-2)"
                strokeWidth={2.5}
                strokeLinecap="round"
                style={{ transition: 'transform 0.4s cubic-bezier(.4,2.3,.6,1)' }}
              />
              {/* Inner hub — covers hand origin with a small two-color cap. */}
              <circle cx={150} cy={150} r={5} fill="var(--ink)" />
              <circle cx={150} cy={150} r={2} fill="var(--acid)" />
            </>
          )}
          {!showLiveHands && (
            /* Center dot — only when hands are not drawn (the hub above
               supersedes it when live). */
            <circle cx={150} cy={150} r={3} fill="var(--ink-2)" />
          )}

          {/* PR5 — Meridiem readout, top-right of dial. Shown when viewing
              today so the user knows the current wall time at a glance. */}
          {isToday && (
            <text
              x={272}
              y={32}
              textAnchor="end"
              fontSize={10}
              fontFamily="var(--font-mono)"
              fill="var(--ink-2)"
              letterSpacing="0.06em"
            >
              <tspan fill="var(--acid)" fontWeight={600}>{meridiem}</tspan>
              <tspan dx={4}>{nowLocalStr}</tspan>
            </text>
          )}
        </svg>

        {/* ADR 0004 §3.6 — empty-day hint. Only when a todo is linked and
            the selected day has zero placements. */}
        {isEmpty && (
          <div
            data-testid="clock-empty-hint"
            style={{
              textAlign: 'center',
              fontSize: 11,
              color: 'var(--ink-3)',
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.08em',
            }}
          >
            DROP A TASK ONTO THE CALENDAR
          </div>
        )}

        {/* ADR 0004 §3.7 — 12h-window toggle, always enabled. */}
        {(() => {
          const targetWindow: 0 | 1 = viewWindow === 0 ? 1 : 0;
          const label = viewWindow === 0 ? '→ 12h–24h' : '← 0h–12h';
          return (
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <button
                type="button"
                style={controlBtnStyle}
                title={`Switch to ${label.slice(2)}`}
                onClick={() => onCommand('clock.setViewWindow', { window: targetWindow })}
              >
                {label}
              </button>
            </div>
          );
        })()}
      </div>
    </MotherFrame>
  );
}
