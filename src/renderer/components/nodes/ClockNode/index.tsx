import type { NodeProps } from '../types';
import type { ClockState, ClockConfig } from './types';
import { MotherFrame, MOTHER_WIDTH, MOTHER_TOTAL } from '../MotherFrame';
import { useBoardStore } from '../../../store/boardStore';
import { useShallow } from 'zustand/react/shallow';
import { selectTimeline } from '../../../store/timelineSelector';

const R = 108;
const CIRCUMFERENCE = 2 * Math.PI * R;
const TOTAL_MIN = 720;

/** Convert a 0-23 hour to a 12-hour display label. */
function wallClockLabel(h: number): string {
  const h24 = ((h % 24) + 24) % 24;
  if (h24 === 0) return '12';
  if (h24 > 12) return String(h24 - 12);
  return String(h24);
}

export function ClockNode({
  node,
  onCommand,
  slotIndex = 6,
  slotTotal = MOTHER_TOTAL,
  onMoveLeft,
  onMoveRight,
}: NodeProps<ClockState, ClockConfig>) {
  const { linkedTodoId, windowStartHour } = node.state;

  // Read all todo nodes (for link dropdown)
  const todoNodes = useBoardStore(
    useShallow((s) => {
      if (!s.board) return [] as Array<{ id: string }>;
      return s.board.nodes
        .filter((n) => n.kind === 'todo')
        .map((n) => ({ id: n.id }));
    }),
  );

  // Read Timeline via selectTimeline — single source of truth (Decision 24).
  // useShallow ensures React only re-renders when the Timeline reference changes,
  // not on every unrelated store mutation.
  const timeline = useBoardStore(
    useShallow((s) => (linkedTodoId ? selectTimeline(s.board, linkedTodoId) : null)),
  );

  const segments = timeline?.segments ?? [];
  const totalMin = timeline?.totalMin ?? 0;

  // Trim trailing break (Decision 24 Q5).
  // The selector always emits a trailing break after the last task/group so
  // future Calendar consumers can keep it. ClockNode strips it here so the
  // ring does not end on dead air.
  const renderableSegments = (() => {
    if (segments.length === 0) return segments;
    const last = segments[segments.length - 1];
    if (last !== undefined && last.kind === 'break') return segments.slice(0, -1);
    return segments;
  })();

  // Build arc geometry. Each segment maps to one SVG <circle>.
  const arcs = renderableSegments.map((seg) => {
    const arcLengthMin = Math.max(0, Math.min(seg.endMin - seg.startMin, TOTAL_MIN - seg.startMin));
    const arcLength = (arcLengthMin / TOTAL_MIN) * CIRCUMFERENCE;
    const startOffset = (seg.startMin / TOTAL_MIN) * CIRCUMFERENCE;
    return { seg, arcLength, startOffset };
  });

  const overflowMin = Math.max(0, totalMin - TOTAL_MIN);

  // 12 tick marks — i=0 is at top (12 o'clock), clockwise at 30° intervals
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
    const label = wallClockLabel(windowStartHour + i);
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

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    color: 'var(--ink-2)',
    fontFamily: 'var(--font-mono)',
  };

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
        {/* Header */}
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
            CLOCK · 12H
          </span>
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

          {/* Timeline arcs — one circle per segment (task or break) */}
          {arcs.map(({ seg, arcLength, startOffset }) => {
            if (seg.kind === 'break') {
              return (
                <circle
                  key={seg.breakId}
                  cx={150}
                  cy={150}
                  r={R}
                  fill="transparent"
                  stroke="var(--ink-4)"
                  strokeWidth={9}
                  strokeDasharray={`${arcLength} ${CIRCUMFERENCE}`}
                  strokeDashoffset={-startOffset}
                  transform="rotate(-90 150 150)"
                  opacity={seg.breakKind === 'long' ? 0.8 : 0.6}
                />
              );
            }
            return (
              <circle
                key={seg.taskId}
                cx={150}
                cy={150}
                r={R}
                fill="transparent"
                stroke={`var(--${seg.colorToken}, #c87080)`}
                strokeWidth={18}
                strokeDasharray={`${arcLength} ${CIRCUMFERENCE}`}
                strokeDashoffset={-startOffset}
                transform="rotate(-90 150 150)"
                opacity={seg.done ? 0.4 : 1}
                style={seg.parallelGroupId !== null ? { mixBlendMode: 'multiply' as const } : undefined}
              />
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

          {/* Center dot */}
          <circle cx={150} cy={150} r={3} fill="var(--ink-2)" />
        </svg>

        {/* Debug overlay — only visible when VITE_CLOCK_DEBUG=1 in dev mode.
            Shows selector output: segment counts + first 6 summaries.
            Usage: `VITE_CLOCK_DEBUG=1 npm run dev` */}
        {import.meta.env.DEV && import.meta.env.VITE_CLOCK_DEBUG === '1' && timeline && (
          <div
            style={{
              fontSize: 9,
              fontFamily: 'var(--font-mono)',
              color: 'var(--ink-3)',
              padding: '4px 8px',
              background: 'var(--paper-2)',
              borderRadius: 4,
              lineHeight: 1.5,
            }}
          >
            <div>
              tasks:{' '}
              {segments.filter((s) => s.kind === 'task').length} | breaks:{' '}
              {segments.filter((s) => s.kind === 'break').length} | total:{' '}
              {totalMin}min
            </div>
            {segments.slice(0, 6).map((s, i) => (
              <div key={i}>
                [{i}]{' '}
                {s.kind === 'task'
                  ? `task ${s.startMin}–${s.endMin} ${s.colorToken}`
                  : `break ${s.startMin}–${s.endMin} ${s.breakKind}`}
              </div>
            ))}
          </div>
        )}

        {/* Overflow badge — shows when totalMin (tasks + breaks) exceeds 720 min */}
        {overflowMin > 0 && (
          <div
            style={{
              textAlign: 'center',
              fontSize: 10,
              color: 'var(--rose)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            +{overflowMin} min
          </div>
        )}

        {/* Window-start control */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            justifyContent: 'center',
          }}
        >
          <span style={labelStyle}>Start:</span>
          <button
            type="button"
            style={controlBtnStyle}
            onClick={() =>
              onCommand('clock.setWindowStart', { hour: windowStartHour - 1 })
            }
          >
            −
          </button>
          <span
            style={{
              fontSize: 12,
              fontFamily: 'var(--font-mono)',
              color: 'var(--ink)',
              minWidth: 28,
              textAlign: 'center',
            }}
          >
            {wallClockLabel(windowStartHour)}
          </span>
          <button
            type="button"
            style={controlBtnStyle}
            onClick={() =>
              onCommand('clock.setWindowStart', { hour: windowStartHour + 1 })
            }
          >
            +
          </button>
        </div>
      </div>
    </MotherFrame>
  );
}
