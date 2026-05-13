// HabitLaneNode — single-habit child card. Click ring to toggle today.
// Reads habit from mother HabitNode via board store. Stores only { habitId }.

import { useMemo, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import type { NodeProps } from '../types';
import type { HabitLaneConfig, HabitLaneState } from './types';
import type { Habit, HabitColor } from '../HabitNode/types';
import { calcStreak } from '../HabitNode/commands';
import { HABIT_COLORS, todayLocal } from '../HabitNode/types';
import { useBoardStore } from '../../../store/boardStore';
import { HabitContextMenu } from '../HabitNode/HabitContextMenu';

const LANE_WIDTH = 200;
const RING_SIZE = 40;
const RING_STROKE = 3;

function isValidColor(c: unknown): c is HabitColor {
  return typeof c === 'string' && (HABIT_COLORS as readonly string[]).includes(c);
}

function habitColor(c: unknown): HabitColor {
  return isValidColor(c) ? c : 'acid';
}

export function HabitLaneNode({
  node,
  onCommand,
}: NodeProps<HabitLaneState, HabitLaneConfig>) {
  const board = useBoardStore((s) => s.board);
  const [menuOpen, setMenuOpen] = useState<{ x: number; y: number } | null>(null);

  const habit: Habit | null = useMemo(() => {
    if (!board) return null;
    for (const n of board.nodes) {
      if (n.kind !== 'habit' || !n.isMother) continue;
      const s = n.state as { habits?: Habit[] } | null;
      const h = s?.habits?.find((x) => x.id === node.state.habitId);
      if (h) return h;
    }
    return null;
  }, [board, node.state.habitId]);

  const today = todayLocal();

  if (!habit) {
    return (
      <div
        style={{
          width: LANE_WIDTH,
          background: 'var(--node-bg)',
          border: '1px dashed var(--paper-3)',
          borderRadius: 'var(--radius-lg)',
          padding: 12,
          color: 'var(--ink-3)',
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          letterSpacing: '0.04em',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span style={{ color: 'var(--rust)' }}>●</span>
        <span>habit removed — delete this lane</span>
      </div>
    );
  }

  const color = habitColor(habit.color);
  const logSet = new Set(habit.log);
  const doneToday = logSet.has(today);
  const streak = calcStreak(habit.log, today);

  const { getNodes } = useReactFlow();
  const onContextMenu = (e: React.MouseEvent) => {
    const selectedCount = getNodes().filter((n) => n.selected).length;
    if (selectedCount > 1) return;
    e.preventDefault();
    e.stopPropagation();
    setMenuOpen({ x: e.clientX, y: e.clientY });
  };

  return (
    <div
      data-testid="habit-lane-root"
      onContextMenu={onContextMenu}
      style={{
        width: LANE_WIDTH,
        background: 'var(--node-bg)',
        border: '1px solid var(--paper-3)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-1)',
        overflow: 'hidden',
        position: 'relative',
        ['--habit-color' as string]: `var(--${color})`,
      } as React.CSSProperties}
    >
      {/* Header */}
      <div
        style={{
          padding: '5px 10px',
          borderBottom: '1px solid var(--paper-3)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: 'var(--ink-3)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        <span style={{ color: `var(--${color})` }}>●</span>
        <span>HBT.LANE</span>
      </div>

      {/* Body */}
      <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Ring toggle */}
        <button
          type="button"
          aria-label={`${habit.name} today ${doneToday ? 'done' : 'not done'}`}
          aria-pressed={doneToday}
          onClick={() => onCommand('habit.lane.toggleToday')}
          style={{
            width: RING_SIZE,
            height: RING_SIZE,
            background: 'transparent',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            flexShrink: 0,
            position: 'relative',
          }}
          title={`click to ${doneToday ? 'unmark' : 'mark'} today`}
        >
          <svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
            <circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_SIZE / 2 - RING_STROKE}
              fill={doneToday ? `var(--${color})` : 'transparent'}
              stroke={`var(--${color})`}
              strokeWidth={RING_STROKE}
            />
          </svg>
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeItems: 'center',
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              fontWeight: 600,
              color: doneToday ? 'var(--ink)' : `var(--${color})`,
              pointerEvents: 'none',
            }}
          >
            {habit.icon ?? '●'}
          </div>
        </button>

        {/* Name + streak */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 12,
              color: 'var(--ink-2)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            title={habit.name}
          >
            {habit.name}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              color: streak > 0 ? 'var(--acid)' : 'var(--ink-4)',
              letterSpacing: '0.04em',
            }}
          >
            {streak > 0 ? `▲ ${streak}d streak` : '—'}
          </div>
        </div>
      </div>

      {menuOpen && (
        <HabitContextMenu
          habit={habit}
          anchor={menuOpen}
          onRename={(name) => onCommand('habit.lane.rename', { name })}
          onSetColor={(color) => onCommand('habit.lane.setColor', { color })}
          onSetIcon={(icon) => onCommand('habit.lane.setIcon', { icon })}
          onDelete={() => onCommand('habit.lane.removeHabit')}
          onClose={() => setMenuOpen(null)}
        />
      )}
    </div>
  );
}
