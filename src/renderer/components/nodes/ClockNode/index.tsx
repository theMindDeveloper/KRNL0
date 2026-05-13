import type { NodeProps } from '../types';
import type { ClockState, ClockConfig } from './types';
import type { TaskState } from '../TaskNode/types';
import { MotherFrame, MOTHER_WIDTH, MOTHER_TOTAL } from '../MotherFrame';
import { useBoardStore } from '../../../store/boardStore';
import { useShallow } from 'zustand/react/shallow';

const COLORS = ['rose', 'sky', 'mint', 'amber', 'violet'] as const;
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

  // Read root tasks belonging to linked todo, sorted by sequenceNumber
  const tasks = useBoardStore(
    useShallow((s) => {
      if (!linkedTodoId || !s.board) return [] as Array<{ id: string; state: TaskState }>;
      return s.board.nodes
        .filter(
          (n) =>
            n.kind === 'todo.task' &&
            (n.state as TaskState).parentTodoId === linkedTodoId &&
            (n.state as TaskState).parentTaskId === null,
        )
        .map((n) => ({ id: n.id, state: n.state as TaskState }))
        .sort((a, b) => a.state.sequenceNumber - b.state.sequenceNumber);
    }),
  );

  // Compute arcs using the clamp rule from Decision 23
  let startMin = 0;
  const arcs = tasks.map((task, i) => {
    const planned = task.state.plannedMin ?? 25;
    const color = COLORS[i % COLORS.length] ?? 'rose';
    const arcLengthMin = Math.max(0, Math.min(planned, TOTAL_MIN - startMin));
    const arcLength = (arcLengthMin / TOTAL_MIN) * CIRCUMFERENCE;
    const startOffset = (startMin / TOTAL_MIN) * CIRCUMFERENCE;
    const arc = {
      key: task.id,
      color,
      arcLength,
      startOffset,
      done: task.state.done,
    };
    startMin += planned;
    return arc;
  });

  const totalPlanned = tasks.reduce(
    (acc, t) => acc + (t.state.plannedMin ?? 25),
    0,
  );
  const overflowMin = Math.max(0, totalPlanned - TOTAL_MIN);

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

          {/* Session arcs — r=108, strokeWidth=18 */}
          {arcs.map((arc) => (
            <circle
              key={arc.key}
              cx={150}
              cy={150}
              r={R}
              fill="transparent"
              stroke={`var(--${arc.color})`}
              strokeWidth={18}
              strokeDasharray={`${arc.arcLength} ${CIRCUMFERENCE}`}
              strokeDashoffset={-arc.startOffset}
              transform="rotate(-90 150 150)"
              opacity={arc.done ? 0.4 : 1}
            />
          ))}

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

        {/* Overflow badge */}
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
