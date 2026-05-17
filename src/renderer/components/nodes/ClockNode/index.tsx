import { useState, useEffect, useMemo, useRef } from 'react';
import type { NodeProps } from '../types';
import type { ClockState, ClockConfig } from './types';
import { todayLocalYMD } from './types';
import { MotherFrame, MOTHER_WIDTH, MOTHER_TOTAL } from '../MotherFrame';
import { useBoardStore } from '../../../store/boardStore';
import { selectSchedule } from '../../../store/scheduleSelector';
import type { TaskState } from '../TaskNode/types';
import type { PomoBreakdown } from '../../../store/pomoSchedule';

// Kept for backward-compat — timelineSelector.colorTokens.test.ts imports this.
// The new analog design no longer renders break arcs, but the tokens must still
// exist in tokens.css (Decision 24.2 contract test).
export const BREAK_TOKENS = ['ink-2', 'ink-3'] as const;

// Shared palette across Clock, Calendar, Todo. See src/renderer/utils/taskColor.ts.
import { colorForTask as colorFor, TASK_TONE_VAR as TONE_VAR, type TaskTone as ToneToken } from '../../../utils/taskColor';

// ── Geometry constants ─────────────────────────────────────────────────────────
const CX = 120;
const CY = 120;
const R_ARC = 102;
const R_FACE = 86;
const R_TICK_OUT = 84;
const R_TICK_IN = 76;
const R_TICK_IN_MAJ = 72;
const R_NUM = 60;

// ── Geometry helpers ───────────────────────────────────────────────────────────

/** Map an hour 0–24 onto its angle on a 12-hour face. 12 sits at top. */
function hourToRad(h: number): number {
  return ((h % 12) / 12) * Math.PI * 2 - Math.PI / 2;
}

function pt(h: number, r: number): { x: number; y: number } {
  const a = hourToRad(h);
  return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) };
}

/** SVG arc path from startH to endH on the 12-h face at radius r. */
function arcPath(startH: number, endH: number, r: number): string {
  const span = Math.max(0.05, endH - startH);
  const a1 = hourToRad(startH);
  const a2 = hourToRad(startH + span);
  const x1 = CX + r * Math.cos(a1);
  const y1 = CY + r * Math.sin(a1);
  const x2 = CX + r * Math.cos(a2);
  const y2 = CY + r * Math.sin(a2);
  const large = span > 6 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}

/** Format hour-float as "9:30am". */
function fmtTime(h: number): string {
  const hr = Math.floor(h);
  const m = Math.round((h - hr) * 60);
  const ampm = hr >= 12 && hr < 24 ? 'pm' : 'am';
  const hr12 = ((hr + 11) % 12) + 1;
  return `${hr12}:${String(m).padStart(2, '0')}${ampm}`;
}

/** Format hour-float duration as "1h30" / "45m". */
function fmtDur(h: number): string {
  const total = Math.round(h * 60);
  if (total >= 60) {
    const hr = Math.floor(total / 60);
    const mn = total % 60;
    return mn ? `${hr}h${mn}` : `${hr}h`;
  }
  return `${total}m`;
}

/** Parse a "YYYY-MM-DDTHH:MM" local-ISO into hour-float. */
function isoToHourFloat(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return null;
  const hh = Number.parseInt(m[4]!, 10);
  const mm = Number.parseInt(m[5]!, 10);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh + mm / 60;
}

// Numerals 1–12. 12 at index 0 so hourToRad(12)=top.
const NUMERALS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;

// ── Flattened task type for display ───────────────────────────────────────────
interface TaskEntry {
  id: string;
  start: number;   // hour-float, e.g. 9.5 = 9:30 AM
  end: number;
  name: string;
  tone: ToneToken;
  plannedMin: number;
  /** Decision 28: null for event tasks, non-null for focus tasks. */
  breakdown: PomoBreakdown | null;
  /** Parallel group id; null if this task is sequential. */
  parallelGroupId: string | null;
  /** 0-based branch index within the parallel group; null if sequential. */
  parallelBranchIndex: number | null;
}

export function ClockNode({
  node,
  onCommand,
  slotIndex = 6,
  slotTotal = MOTHER_TOTAL,
}: NodeProps<ClockState, ClockConfig>) {
  const { linkedTodoId, viewWindow } = node.state;

  // PERF (Wave C+): the previous 1-second setInterval re-rendered this
  // entire SVG (60 ticks + 12 numerals + arcs + 3 hands + meridiem + task
  // list) every second via React reconciliation — a once-per-second frame
  // hitch that contributed to the canvas stutter. Replaced with:
  //   1. A 30-second state tick that drives hour/minute hands, meridiem,
  //      active-task highlight, and the "now notch" position. Minute
  //      precision is unaffected (still updates twice per minute).
  //   2. A pure CSS rotation animation on the second hand (60s linear
  //      infinite) with `animation-delay: -${initialSeconds}s` so the
  //      starting position is correct without any per-frame React work.
  //      The hand sweeps continuously, GPU-composited, zero JS cost.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Initial seconds offset for the CSS-driven second-hand sweep. Captured
  // once at mount; the hand continues sweeping via CSS regardless of React.
  const initialSecOffsetRef = useRef<number>(new Date().getSeconds());

  const hours = now.getHours();
  const mins  = now.getMinutes();
  // No `secs` here — second-hand position comes from CSS animation.
  // nowFloat uses minute granularity which is fine for activeIdx / now notch.
  const nowFloat = hours + mins / 60;

  // Hand angles (degrees from 12, CW)
  const hourAng = ((hours % 12) + mins / 60) / 12 * 360;
  const minAng  = mins / 60 * 360;

  // Board + selectors
  const board = useBoardStore((s) => s.board);

  const todoNodes = useMemo(() => {
    if (!board) return [] as Array<{ id: string }>;
    return board.nodes
      .filter((n) => n.kind === 'todo')
      .map((n) => ({ id: n.id }));
  }, [board?.nodes]);

  const placementsMap = useMemo(() => {
    if (!board) return null;
    return selectSchedule(board).placements;
  }, [board]);

  // Task info — includes text now.
  const taskInfo = useMemo(() => {
    const m = new Map<string, { done: boolean; plannedMin: number; parentTodoId: string; text: string }>();
    if (!board) return m;
    for (const n of board.nodes) {
      if (n.kind !== 'todo.task') continue;
      const ts = n.state as TaskState;
      m.set(n.id, {
        done: ts.done,
        plannedMin: ts.plannedMin ?? ts.durationMin,
        parentTodoId: ts.parentTodoId,
        text: ts.text,
      });
    }
    return m;
  }, [board?.nodes]);

  // Flatten placements to TaskEntry[]. Filter by selected 12-hour viewWindow.
  const tasks: TaskEntry[] = useMemo(() => {
    if (!placementsMap || !linkedTodoId) return [];
    const today = todayLocalYMD();
    const winLo = viewWindow === 1 ? 12 : 0;
    const winHi = viewWindow === 1 ? 24 : 12;
    const out: TaskEntry[] = [];
    for (const p of placementsMap.values()) {
      const info = taskInfo.get(p.taskId);
      if (!info) continue;
      if (info.parentTodoId !== linkedTodoId) continue;
      const startDate = p.startISO.slice(0, 10);
      if (startDate !== today) continue;
      const startH = isoToHourFloat(p.startISO);
      if (startH === null) continue;
      const endH = isoToHourFloat(p.endISO) ?? startH + info.plannedMin / 60;
      if (endH <= startH) continue;
      // 12h window filter: keep only tasks intersecting [winLo, winHi).
      if (endH <= winLo || startH >= winHi) continue;
      out.push({
        id: p.taskId,
        start: Math.max(startH, winLo),
        end: Math.min(endH, winHi),
        name: info.text,
        tone: colorFor(p.taskId),
        plannedMin: info.plannedMin,
        breakdown: p.breakdown,
        parallelGroupId: p.parallelGroupId,
        parallelBranchIndex: p.parallelBranchIndex,
      });
    }
    // Sort by start time
    out.sort((a, b) => a.start - b.start);
    return out;
  }, [placementsMap, linkedTodoId, taskInfo, viewWindow]);

  const activeIdx = tasks.findIndex((t) => nowFloat >= t.start && nowFloat < t.end);

  const activeProgress = activeIdx >= 0
    ? (nowFloat - tasks[activeIdx]!.start) / (tasks[activeIdx]!.end - tasks[activeIdx]!.start)
    : 0;
  const activeColor = activeIdx >= 0 ? TONE_VAR[tasks[activeIdx]!.tone] : 'var(--ink-3)';

  // Styles
  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    color: 'var(--ink-2)',
    fontFamily: 'var(--font-mono)',
  };

  return (
    <MotherFrame
      nodeId={node.id}
      slotIndex={slotIndex}
      slotTotal={slotTotal}
      width={MOTHER_WIDTH}
      position={node.position}
    >
      <div
        style={{
          padding: '10px 14px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          height: '100%',
          boxSizing: 'border-box',
          overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--ink-2)' }}>
            <span style={{ color: 'var(--cyan)', fontSize: 9 }}>◉</span>
            Today · Schedule
          </span>
          <span style={{ color: 'var(--ink-4)' }}>CLK.12H</span>
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

        {/* 12-hour window toggle bar — prominent, above the clock face.
            Shows which half-day the arcs reflect and lets users swap. */}
        <div
          data-testid="clock-window-bar"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '4px 0 2px',
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            userSelect: 'none',
          }}
        >
          <button
            type="button"
            data-testid="clock-window-am"
            onClick={() => onCommand('clock.setViewWindow', { window: 0 })}
            style={{
              padding: '3px 10px',
              background: viewWindow === 0 ? 'var(--rust)' : 'transparent',
              color: viewWindow === 0 ? 'var(--paper)' : 'var(--ink-3)',
              border: `1px solid ${viewWindow === 0 ? 'var(--rust)' : 'var(--paper-3)'}`,
              borderRadius: 4,
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 'inherit',
              letterSpacing: 'inherit',
              fontWeight: viewWindow === 0 ? 700 : 400,
            }}
          >
            AM · 0–12
          </button>
          <button
            type="button"
            data-testid="clock-window-swap"
            onClick={() => onCommand('clock.setViewWindow', { window: viewWindow === 0 ? 1 : 0 })}
            title="Show next 12 hours"
            style={{
              padding: '3px 8px',
              background: 'transparent',
              color: 'var(--ink-2)',
              border: '1px solid var(--paper-3)',
              borderRadius: 4,
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 12,
              lineHeight: 1,
            }}
          >
            ⇆
          </button>
          <button
            type="button"
            data-testid="clock-window-pm"
            onClick={() => onCommand('clock.setViewWindow', { window: 1 })}
            style={{
              padding: '3px 10px',
              background: viewWindow === 1 ? 'var(--rust)' : 'transparent',
              color: viewWindow === 1 ? 'var(--paper)' : 'var(--ink-3)',
              border: `1px solid ${viewWindow === 1 ? 'var(--rust)' : 'var(--paper-3)'}`,
              borderRadius: 4,
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 'inherit',
              letterSpacing: 'inherit',
              fontWeight: viewWindow === 1 ? 700 : 400,
            }}
          >
            PM · 12–24
          </button>
        </div>

        {/* Clock face — container wider than SVG viewBox so outward-growing
            train tracks don't clip on the parent div edge. */}
        <div style={{ position: 'relative', width: 244, height: 244, margin: '0 auto', overflow: 'visible' }}>
          <svg
            viewBox="0 0 240 240"
            style={{ width: '100%', height: '100%', display: 'block', overflow: 'visible' }}
          >
            {/* Train-track concentric lanes.
                One gray "track" circle per overlapping-task lane.
                Tasks ride their assigned lane's track.
                Stroke width auto-shrinks as lanes are added so all rings
                fit within the outer band without crossing the numerals. */}
            {(() => {
              // ── Lane assignment (interval-graph coloring on time overlap) ──
              const sortedByStart = [...tasks].sort((a, b) => a.start - b.start);
              const laneEnds: number[] = [];
              const laneByTaskId = new Map<string, number>();
              for (const t of sortedByStart) {
                let lane = laneEnds.findIndex((end) => end <= t.start);
                if (lane === -1) {
                  lane = laneEnds.length;
                  laneEnds.push(t.end);
                } else {
                  laneEnds[lane] = t.end;
                }
                laneByTaskId.set(t.id, lane);
              }
              const totalLanes = Math.max(1, laneEnds.length);

              // ── Geometry: tracks grow OUTWARD from the clock edge ──
              // Lane 0 = innermost, sits just outside the clock face.
              // Each new lane stacks further outward (larger radius).
              // Thin uniform stroke — no shrinking; the clock has free space
              // around it for many tracks before overflowing the node bounds.
              const STROKE = 4;           // thin train track
              const LANE_GAP = 2;         // gap between adjacent tracks
              // Innermost track inner-edge sits exactly at R_ARC (clock radius).
              // Stroke is centered at R_ARC + STROKE/2 so the ring hugs the
              // clock's outer perimeter with zero gap.
              const radiusForLane = (lane: number): number =>
                R_ARC + STROKE / 2 + lane * (STROKE + LANE_GAP);
              const radiusFor = (t: TaskEntry): number =>
                radiusForLane(laneByTaskId.get(t.id) ?? 0);
              const stroke = STROKE;

              // ── Gray train tracks, one per lane in use ──
              const tracks: React.ReactElement[] = [];
              for (let lane = 0; lane < totalLanes; lane++) {
                tracks.push(
                  <circle
                    key={`track-${lane}`}
                    cx={CX} cy={CY} r={radiusForLane(lane)}
                    fill="none"
                    stroke="var(--paper-3)"
                    strokeWidth={stroke}
                    opacity={0.55}
                  />,
                );
              }

              // ── Task arcs riding their lane's track ──
              const arcs = tasks.flatMap((t, i) => {
                const ended = nowFloat >= t.end;
                const active = i === activeIdx;
                const opacity = ended ? 0.4 : 1;
                const sw = stroke;
                const r = radiusFor(t);
                const activeStyle: React.CSSProperties = active
                  ? { animation: 'clock-arc-pulse 2.4s ease-in-out infinite', color: TONE_VAR[t.tone] }
                  : {};
                const breakdown = t.breakdown;

                if (breakdown === null || breakdown.segments.length <= 1) {
                  return [
                    <path
                      key={t.id}
                      d={arcPath(t.start, t.end, r)}
                      fill="none"
                      stroke={TONE_VAR[t.tone]}
                      strokeWidth={sw}
                      strokeLinecap="round"
                      opacity={opacity}
                      style={activeStyle}
                    />,
                  ];
                }

                const out: React.ReactElement[] = [];
                out.push(
                  <path
                    key={`${t.id}-base`}
                    d={arcPath(t.start, t.end, r)}
                    fill="none"
                    stroke={TONE_VAR[t.tone]}
                    strokeWidth={sw}
                    strokeLinecap="round"
                    opacity={opacity}
                    style={activeStyle}
                  />,
                );
                let segCursor = t.start;
                for (let s = 0; s < breakdown.segments.length; s++) {
                  const seg = breakdown.segments[s]!;
                  const segEnd = Math.min(segCursor + seg.min / 60, t.end);
                  if (seg.kind !== 'work' && segEnd > segCursor) {
                    out.push(
                      <path
                        key={`${t.id}-seg-${s}`}
                        data-testid="clock-task-break-arc"
                        data-break-kind={seg.kind}
                        d={arcPath(segCursor, segEnd, r)}
                        fill="none"
                        stroke="var(--paper)"
                        strokeWidth={sw}
                        strokeLinecap="butt"
                        opacity={opacity}
                      />,
                    );
                  }
                  segCursor = segEnd;
                }
                return out;
              });

              return [...tracks, ...arcs];
            })()}

            {/* Now notch — INSIDE the clock face, on the tick belt */}
            {(() => {
              const pIn  = pt(nowFloat, R_TICK_IN);
              const pOut = pt(nowFloat, R_TICK_OUT);
              const pDot = pt(nowFloat, R_TICK_OUT - 2);
              return (
                <>
                  <line
                    x1={pIn.x} y1={pIn.y}
                    x2={pOut.x} y2={pOut.y}
                    stroke="var(--rust)"
                    strokeWidth={2}
                    opacity={0.9}
                  />
                  <circle cx={pDot.x} cy={pDot.y} r={2.5} fill="var(--rust)" />
                </>
              );
            })()}

            {/* Inner face */}
            <circle
              cx={CX} cy={CY} r={R_FACE}
              fill="var(--node-bg)"
              stroke="var(--paper-3)"
              strokeWidth={1}
            />

            {/* 60 tick marks */}
            {Array.from({ length: 60 }).map((_, i) => {
              const a = (i / 60) * Math.PI * 2 - Math.PI / 2;
              const isHour = i % 5 === 0;
              const r1 = isHour ? R_TICK_IN_MAJ : R_TICK_IN;
              return (
                <line
                  key={i}
                  x1={CX + r1 * Math.cos(a)}
                  y1={CY + r1 * Math.sin(a)}
                  x2={CX + R_TICK_OUT * Math.cos(a)}
                  y2={CY + R_TICK_OUT * Math.sin(a)}
                  stroke={isHour ? 'var(--ink-2)' : 'var(--ink-3)'}
                  strokeWidth={isHour ? 1.5 : 0.8}
                />
              );
            })}

            {/* Numerals 1–12 */}
            {NUMERALS.map((n) => {
              const p = pt(n, R_NUM);
              return (
                <text
                  key={n}
                  x={p.x}
                  y={p.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontFamily="var(--font-mono)"
                  fontSize={11}
                  fontWeight={n === 12 ? 700 : 600}
                  fill={n === 12 ? 'var(--rust)' : 'var(--ink-2)'}
                  letterSpacing="0.02em"
                >
                  {n}
                </text>
              );
            })}

            {/* Hour hand */}
            <g transform={`rotate(${hourAng - 90} ${CX} ${CY})`}>
              <line
                x1={CX - 8} y1={CY} x2={CX + 38} y2={CY}
                stroke="var(--ink)"
                strokeWidth={3.2}
                strokeLinecap="round"
              />
            </g>

            {/* Minute hand */}
            <g transform={`rotate(${minAng - 90} ${CX} ${CY})`}>
              <line
                x1={CX - 10} y1={CY} x2={CX + 56} y2={CY}
                stroke="var(--ink)"
                strokeWidth={2}
                strokeLinecap="round"
              />
            </g>

            {/* Second hand — CSS keyframe sweep (60s linear infinite).
                Continuous, GPU-composited, zero React work per frame.
                animation-delay aligns the starting angle to the current
                seconds at mount. */}
            <g
              style={{
                transformOrigin: `${CX}px ${CY}px`,
                animation: 'clock-sec-sweep 60s linear infinite',
                animationDelay: `-${initialSecOffsetRef.current}s`,
              }}
            >
              <line
                x1={CX - 14} y1={CY} x2={CX + 62} y2={CY}
                stroke="var(--rust)"
                strokeWidth={1}
                strokeLinecap="round"
                opacity={0.9}
              />
              <circle cx={CX + 60} cy={CY} r={2} fill="var(--rust)" />
            </g>

            {/* Hub */}
            <circle cx={CX} cy={CY} r={5} fill="var(--ink)" />
            <circle cx={CX} cy={CY} r={1.6} fill="var(--acid)" />
          </svg>

          {/* Meridiem readout — positioned inside the inner face just below
              the 12 numeral. Previous `top:70 + fontSize:9` collided with
              the "11" numeral (which sits at SVG y≈68). Bumped down to 92
              and shrunk to 7.5px so it sits clear of all face numerals. */}
          {/* Current wall-clock time label (HH:MM, mono). The AM/PM swap UI
              lives in the dedicated bar above the clock face. */}
          <div
            style={{
              position: 'absolute',
              top: 92,
              left: '50%',
              transform: 'translateX(-50%)',
              fontFamily: 'var(--font-mono)',
              fontSize: 8,
              letterSpacing: '0.16em',
              color: 'var(--ink-4)',
              textTransform: 'uppercase',
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            {String(hours).padStart(2, '0')}:{String(mins).padStart(2, '0')}
          </div>
        </div>

        {/* Now-playing strip */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            width: '100%',
            padding: '8px 10px',
            background: 'var(--paper-2)',
            border: '1px solid var(--paper-3)',
            borderRadius: 5,
            fontFamily: 'var(--font-mono)',
            fontSize: 10.5,
            position: 'relative',
            overflow: 'hidden',
            boxSizing: 'border-box',
            color: activeColor,
          }}
        >
          {/* Progress fill */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(90deg, currentColor 0%, currentColor 100%)',
              opacity: 0.1,
              pointerEvents: 'none',
              transformOrigin: '0 50%',
              transform: `scaleX(${activeProgress})`,
            }}
          />
          {activeIdx >= 0 ? (
            <>
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  flexShrink: 0,
                  background: activeColor,
                  boxShadow: `0 0 8px ${activeColor}`,
                  display: 'inline-block',
                }}
              />
              <span
                style={{
                  color: 'var(--ink)',
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  fontSize: 10.5,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: 130,
                }}
              >
                {tasks[activeIdx]!.name}
              </span>
              <span
                style={{
                  marginLeft: 'auto',
                  color: 'var(--ink-3)',
                  fontSize: 9.5,
                  letterSpacing: '0.04em',
                  flexShrink: 0,
                }}
              >
                {fmtTime(tasks[activeIdx]!.start)} → {fmtTime(tasks[activeIdx]!.end)}
              </span>
            </>
          ) : (
            <>
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  flexShrink: 0,
                  background: 'var(--ink-3)',
                  display: 'inline-block',
                }}
              />
              <span
                style={{
                  color: 'var(--ink-3)',
                  textTransform: 'none',
                  fontWeight: 400,
                  fontSize: 10.5,
                }}
              >
                free · {fmtTime(nowFloat)}
              </span>
            </>
          )}
        </div>

        {/* Task list */}
        <div
          style={{
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
            fontFamily: 'var(--font-mono)',
          }}
        >
          {tasks.map((t, i) => {
            const ended = nowFloat >= t.end;
            const on    = i === activeIdx;
            return (
              <div
                key={t.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '4px 56px 1fr auto',
                  alignItems: 'center',
                  gap: 8,
                  padding: '4px 0',
                  opacity: ended ? 0.42 : 1,
                  position: 'relative',
                }}
              >
                {/* Color bar */}
                <span
                  style={{
                    width: 4,
                    height: 16,
                    borderRadius: 1,
                    background: TONE_VAR[t.tone],
                    display: 'inline-block',
                    alignSelf: 'center',
                  }}
                />
                {/* Start time */}
                <span
                  style={{
                    color: on ? 'var(--rust)' : 'var(--ink-3)',
                    fontSize: 9.5,
                    letterSpacing: '0.02em',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {fmtTime(t.start)}
                </span>
                {/* Name */}
                <span
                  style={{
                    color: 'var(--ink)',
                    fontSize: 12,
                    fontFamily: 'var(--font-sans)',
                    fontWeight: on ? 600 : 400,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    textDecoration: ended ? 'line-through' : 'none',
                    textDecorationColor: 'var(--ink-4)',
                  }}
                >
                  {t.name}
                </span>
                {/* Duration */}
                <span
                  style={{
                    color: 'var(--ink-4)',
                    fontSize: 9.5,
                    letterSpacing: '0.02em',
                  }}
                >
                  {fmtDur(t.end - t.start)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </MotherFrame>
  );
}
