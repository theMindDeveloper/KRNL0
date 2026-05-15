import { useState, useEffect, useMemo, useRef } from 'react';
import type { NodeProps } from '../types';
import type { ClockState, ClockConfig } from './types';
import { todayLocalYMD } from './types';
import { MotherFrame, MOTHER_WIDTH, MOTHER_TOTAL } from '../MotherFrame';
import { useBoardStore } from '../../../store/boardStore';
import { selectSchedule } from '../../../store/scheduleSelector';
import type { TaskState } from '../TaskNode/types';

// Kept for backward-compat — timelineSelector.colorTokens.test.ts imports this.
// The new analog design no longer renders break arcs, but the tokens must still
// exist in tokens.css (Decision 24.2 contract test).
export const BREAK_TOKENS = ['ink-2', 'ink-3'] as const;

// Tone palette for the new analog design. Deterministic per taskId.
const TONE_PALETTE = ['rust', 'spine', 'cyan', 'plum', 'rust-deep', 'amber'] as const;
type ToneToken = (typeof TONE_PALETTE)[number];

/** Deterministic tone for a task — stable for a given taskId. */
function colorFor(taskId: string): ToneToken {
  let h = 0;
  for (let i = 0; i < taskId.length; i++) h = (h * 31 + taskId.charCodeAt(i)) >>> 0;
  return TONE_PALETTE[h % TONE_PALETTE.length]!;
}

const TONE_VAR: Record<ToneToken, string> = {
  rust:        'var(--rust)',
  spine:       'var(--spine)',
  cyan:        'var(--cyan)',
  plum:        'var(--plum)',
  'rust-deep': 'var(--rust-deep)',
  amber:       'var(--amber)',
};

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
}

export function ClockNode({
  node,
  onCommand,
  slotIndex = 6,
  slotTotal = MOTHER_TOTAL,
}: NodeProps<ClockState, ClockConfig>) {
  const { linkedTodoId } = node.state;

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

  // Flatten placements to TaskEntry[].
  const tasks: TaskEntry[] = useMemo(() => {
    if (!placementsMap || !linkedTodoId) return [];
    const today = todayLocalYMD();
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
      out.push({
        id: p.taskId,
        start: startH,
        end: endH,
        name: info.text,
        tone: colorFor(p.taskId),
        plannedMin: info.plannedMin,
      });
    }
    // Sort by start time
    out.sort((a, b) => a.start - b.start);
    return out;
  }, [placementsMap, linkedTodoId, taskInfo]);

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

        {/* Clock face */}
        <div style={{ position: 'relative', width: 244, height: 244, margin: '0 auto' }}>
          <svg
            viewBox="0 0 240 240"
            style={{ width: '100%', height: '100%', display: 'block', overflow: 'visible' }}
          >
            {/* Outer arc track */}
            <circle
              cx={CX} cy={CY} r={R_ARC}
              fill="none"
              stroke="var(--paper-3)"
              strokeWidth={14}
              opacity={0.7}
            />

            {/* Task arcs */}
            {tasks.map((t, i) => {
              const ended  = nowFloat >= t.end;
              const active = i === activeIdx;
              const opacity = ended ? 0.35 : active ? 1 : 0.92;
              const sw = active ? 16 : 14;
              const style: React.CSSProperties = active
                ? { animation: 'clock-arc-pulse 2.4s ease-in-out infinite', color: TONE_VAR[t.tone] }
                : {};
              return (
                <path
                  key={t.id}
                  d={arcPath(t.start, t.end, R_ARC)}
                  fill="none"
                  stroke={TONE_VAR[t.tone]}
                  strokeWidth={sw}
                  strokeLinecap="round"
                  opacity={opacity}
                  style={style}
                />
              );
            })}

            {/* Now notch */}
            {(() => {
              const p    = pt(nowFloat, R_ARC);
              const pIn  = pt(nowFloat, R_ARC - 11);
              const pOut = pt(nowFloat, R_ARC + 11);
              return (
                <>
                  <line
                    x1={pIn.x} y1={pIn.y}
                    x2={pOut.x} y2={pOut.y}
                    stroke="var(--rust)"
                    strokeWidth={1.5}
                    opacity={0.85}
                  />
                  <circle cx={p.x} cy={p.y} r={3} fill="var(--rust)" />
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
          <div
            style={{
              position: 'absolute',
              top: 92,
              left: '50%',
              transform: 'translateX(-50%)',
              fontFamily: 'var(--font-mono)',
              fontSize: 7.5,
              letterSpacing: '0.16em',
              color: 'var(--ink-4)',
              textTransform: 'uppercase',
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ color: 'var(--rust)', marginRight: 3, fontWeight: 700 }}>
              {hours >= 12 ? 'PM' : 'AM'}
            </span>
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
