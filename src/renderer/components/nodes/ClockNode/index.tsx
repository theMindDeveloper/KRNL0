import type { NodeProps } from '../types';
import type { ClockState, ClockConfig } from './types';
import { MotherFrame, MOTHER_WIDTH, MOTHER_TOTAL } from '../MotherFrame';
import { useBoardStore } from '../../../store/boardStore';
import { useShallow } from 'zustand/react/shallow';
import { selectTimeline } from '../../../store/timelineSelector';

const R = 108;
const CIRCUMFERENCE = 2 * Math.PI * R;
const TOTAL_MIN = 720;

// Decision 24.2 — palette is constrained to tokens defined in src/renderer/styles/tokens.css.
// Adding a name here without a matching `--<name>` definition will cause break arcs to paint nothing.
// Index 0 = long break (strongest ink), Index 1 = short break (medium ink).
export const BREAK_TOKENS = ['ink-2', 'ink-3'] as const;

export function ClockNode({
  node,
  onCommand,
  slotIndex = 6,
  slotTotal = MOTHER_TOTAL,
  onMoveLeft,
  onMoveRight,
}: NodeProps<ClockState, ClockConfig>) {
  const { linkedTodoId, viewWindow } = node.state;

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

  // Decision 24.2 Q3.5 — Defensive clamp: if the plan fits within window 0,
  // force-render window 0 regardless of persisted viewWindow. Prevents stranding
  // the user on an empty ring after they delete tasks. Does NOT mutate persisted state.
  const effectiveWindow: 0 | 1 = totalMin <= TOTAL_MIN ? 0 : viewWindow;
  const windowStart = effectiveWindow * TOTAL_MIN;
  const windowEnd = windowStart + TOTAL_MIN;

  // Build a branch-index map for parallel tasks so each branch gets its own radius.
  const parallelBranchIndex = new Map<string, number>();
  if (timeline?.parallelGroups) {
    for (const group of timeline.parallelGroups.values()) {
      group.taskIds.forEach((id, idx) => parallelBranchIndex.set(id, idx));
    }
  }

  // Decision 24.2 Q3 — Build arc geometry using windowed flatMap.
  // Segments outside the current 12h window are filtered out; boundary-spanning
  // segments are clipped to their intersection with [windowStart, windowEnd).
  // Parallel tasks use concentric rings (branch 0 = outer, 1 = middle, 2 = inner).
  const arcs = renderableSegments.flatMap((seg) => {
    const segStart = Math.max(seg.startMin, windowStart);
    const segEnd = Math.min(seg.endMin, windowEnd);
    if (segEnd <= segStart) return [];   // outside this window — skip
    const arcLengthMin = segEnd - segStart;
    const offsetMin = segStart - windowStart;   // relative to window

    let arcR = R;
    let arcSW = 18;
    if (seg.kind === 'break') {
      arcSW = seg.breakKind === 'long' ? 10 : 6;
    } else if (seg.parallelGroupId !== null) {
      const branchIdx = parallelBranchIndex.get(seg.taskId) ?? 0;
      arcR = R + 5 - branchIdx * 10; // 113, 103, 93 ...
      arcSW = 7;
    }
    const arcCircumference = 2 * Math.PI * arcR;
    const arcLength = (arcLengthMin / TOTAL_MIN) * arcCircumference;
    const startOffset = (offsetMin / TOTAL_MIN) * arcCircumference;
    return [{ seg, arcLength, startOffset, arcR, arcSW, arcCircumference }];
  });

  // Decision 24.2 Q3 — overflow badge: only past 1440 min (24h), not 720.
  const overflowMin = Math.max(0, totalMin - 2 * TOTAL_MIN);

  // Decision 24.2 Q3 — 12 tick marks; labels derived from effectiveWindow, not wall-clock.
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
    const hour = effectiveWindow * 12 + i;   // 0..11 or 12..23
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
        {/* Header — Decision 24.2: dynamic range label */}
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
            {`CLOCK · ${effectiveWindow * 12}–${(effectiveWindow + 1) * 12}H`}
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
          {arcs.map(({ seg, arcLength, startOffset, arcR, arcSW, arcCircumference }) => {
            if (seg.kind === 'break') {
              // Decision 24.2 Q1 — break arcs: ink-2/ink-3 at opacity 1.
              // Short break: BREAK_TOKENS[1]='ink-3', strokeWidth=6.
              // Long break:  BREAK_TOKENS[0]='ink-2', strokeWidth=10.
              const isLong = seg.breakKind === 'long';
              const strokeColor = isLong
                ? `var(--${BREAK_TOKENS[0]})`
                : `var(--${BREAK_TOKENS[1]})`;
              const durationMin = seg.endMin - seg.startMin;
              const kindLabel = isLong ? 'long break' : 'short break';
              return (
                <g key={`${seg.breakId}-w${effectiveWindow}`}>
                  <title>{`${kindLabel} · ${durationMin}m`}</title>
                  <circle
                    cx={150}
                    cy={150}
                    r={arcR}
                    fill="transparent"
                    stroke={strokeColor}
                    strokeWidth={arcSW}
                    strokeDasharray={`${arcLength} ${arcCircumference}`}
                    strokeDashoffset={-startOffset}
                    transform="rotate(-90 150 150)"
                    opacity={1}
                  />
                </g>
              );
            }
            const durationMin = seg.endMin - seg.startMin;
            return (
              <g key={`${seg.taskId}-w${effectiveWindow}`}>
                <title>{`task ${seg.taskId.slice(-8)} · ${durationMin}m`}</title>
                <circle
                  cx={150}
                  cy={150}
                  r={arcR}
                  fill="transparent"
                  stroke={`var(--${seg.colorToken}, #c87080)`}
                  strokeWidth={arcSW}
                  strokeDasharray={`${arcLength} ${arcCircumference}`}
                  strokeDashoffset={-startOffset}
                  transform="rotate(-90 150 150)"
                  opacity={seg.done ? 0.4 : 1}
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
              {totalMin}min | win:{effectiveWindow}
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

        {/* Overflow badge — shows only when totalMin exceeds 1440 min (24h).
            Decision 24.2: badge threshold moved from 720 to 1440; user can
            navigate minutes 720-1440 via the view toggle. */}
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

        {/* Decision 24.2 Q3 — 12h view toggle (replaces Start: −/+ row).
            Disabled when the plan fits within window 0 (totalMin ≤ 720). */}
        {(() => {
          const canToggle = totalMin > TOTAL_MIN;
          const targetWindow: 0 | 1 = effectiveWindow === 0 ? 1 : 0;
          const label = effectiveWindow === 0 ? '→ 12h–24h' : '← 0h–12h';
          return (
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <button
                type="button"
                disabled={!canToggle}
                style={{
                  ...controlBtnStyle,
                  opacity: canToggle ? 1 : 0.4,
                  cursor: canToggle ? 'pointer' : 'not-allowed',
                }}
                title={canToggle ? `Switch to ${label.slice(2)}` : 'Plan fits within 12h'}
                onClick={() => {
                  if (canToggle) onCommand('clock.setViewWindow', { window: targetWindow });
                }}
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
