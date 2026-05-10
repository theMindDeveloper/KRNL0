// Decision #11 — HabitNode component.
// Week grid and streak are derived at render time from the sparse log.
// weekStart is computed (not stored) as the most recent Monday in local time.
// All state mutations go through onCommand.

import { useState } from 'react';
import type { NodeProps } from '../types';
import type { HabitConfig, HabitState } from './types';
import { getWeekDays, todayLocal } from './types';
import { calcStreak } from './commands';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const CELL_SIZE = 26;
const CELL_GAP = 3;

export function HabitNode({ node, onCommand }: NodeProps<HabitState, HabitConfig>) {
  const { state } = node;
  const [newName, setNewName] = useState('');

  // Week days derived from current local clock — no stored weekStart (Decision #11).
  const today = todayLocal();
  const weekDays = getWeekDays(new Date());

  const visibleHabits = state.habits.filter((h) => !h.archived);

  const handleAddHabit = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    onCommand('habit.add', { name: trimmed });
    setNewName('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleAddHabit();
  };

  return (
    <div
      style={{
        width: 320,
        border: '1px solid var(--paper-3)',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--node-bg)',
        boxShadow: 'var(--shadow-1)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '7px 10px 6px',
          borderBottom: '1px solid var(--paper-3)',
          fontFamily: 'var(--font-mono)',
          fontSize: 10.5,
          color: 'var(--ink-3)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        {'▙ HABITS'}
      </div>

      <div style={{ padding: '12px 14px' }}>
        {/* Day labels header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            marginBottom: 6,
          }}
        >
          {/* Spacer for habit name + streak columns */}
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: CELL_GAP }}>
            {DAY_LABELS.map((label, i) => {
              const dayStr = weekDays[i];
              const isToday = dayStr === today;
              return (
                <div
                  key={i}
                  style={{
                    width: CELL_SIZE,
                    textAlign: 'center',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 9,
                    color: isToday ? 'var(--acid)' : 'var(--ink-3)',
                    opacity: isToday ? 0.7 : 1,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  {label}
                </div>
              );
            })}
          </div>
          {/* Spacer for delete button column */}
          <div style={{ width: 22, marginLeft: 6 }} />
        </div>

        {/* Habit rows */}
        {visibleHabits.length === 0 ? (
          <div
            style={{
              color: 'var(--ink-3)',
              fontSize: 12,
              fontFamily: 'var(--font-sans)',
              padding: '4px 0',
            }}
          >
            No habits yet.
          </div>
        ) : (
          visibleHabits.map((habit) => {
            const streak = calcStreak(habit.log, today);
            return (
              <div
                key={habit.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  marginBottom: 5,
                }}
              >
                {/* Habit name + streak */}
                <div style={{ flex: 1, minWidth: 0, marginRight: 6 }}>
                  <div
                    style={{
                      fontSize: 11.5,
                      fontFamily: 'var(--font-sans)',
                      color: 'var(--ink-2)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                    title={habit.name}
                  >
                    {habit.name}
                  </div>
                  {streak > 0 && (
                    <div
                      style={{
                        fontSize: 9,
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--rust)',
                        letterSpacing: '0.04em',
                        marginTop: 1,
                      }}
                    >
                      {streak}d
                    </div>
                  )}
                </div>

                {/* 7-day grid cells */}
                <div style={{ display: 'flex', gap: CELL_GAP }}>
                  {weekDays.map((dayStr) => {
                    const done = habit.log.includes(dayStr);
                    const isToday = dayStr === today;
                    const isPast = dayStr < today;

                    // Cell appearance based on done/today/past state
                    let cellBackground: string;
                    let cellBorder: string;
                    let cellOpacity: number | undefined;

                    if (done && isToday) {
                      cellBackground = 'var(--acid)';
                      cellBorder = '1px solid transparent';
                      cellOpacity = 0.85;
                    } else if (done && isPast) {
                      cellBackground = 'var(--spine)';
                      cellBorder = '1px solid transparent';
                      cellOpacity = 0.7;
                    } else if (!done && isToday) {
                      cellBackground = 'transparent';
                      cellBorder = '1px solid var(--ink-3)';
                      cellOpacity = undefined;
                    } else {
                      // past unchecked
                      cellBackground = 'var(--paper-3)';
                      cellBorder = '1px solid transparent';
                      cellOpacity = 0.4;
                    }

                    return (
                      <button
                        key={dayStr}
                        type="button"
                        title={dayStr}
                        onClick={() =>
                          onCommand('habit.toggleDay', { id: habit.id, date: dayStr })
                        }
                        style={{
                          width: CELL_SIZE,
                          height: CELL_SIZE,
                          border: cellBorder,
                          borderRadius: 4,
                          background: cellBackground,
                          opacity: cellOpacity,
                          cursor: 'pointer',
                          padding: 0,
                          flexShrink: 0,
                        }}
                        aria-label={`${habit.name} ${dayStr} ${done ? 'done' : 'not done'}`}
                        aria-pressed={done}
                      />
                    );
                  })}
                </div>

                {/* Delete button */}
                <button
                  type="button"
                  title={`Remove ${habit.name}`}
                  onClick={() => onCommand('habit.remove', { id: habit.id })}
                  style={{
                    width: 16,
                    height: 16,
                    marginLeft: 6,
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    color: 'var(--ink-3)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                    lineHeight: 1,
                    padding: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                  aria-label={`Remove ${habit.name}`}
                >
                  {'×'}
                </button>
              </div>
            );
          })
        )}

        {/* Add habit input */}
        <div
          style={{
            display: 'flex',
            gap: 6,
            marginTop: 10,
            borderTop: '1px solid var(--paper-3)',
            paddingTop: 10,
          }}
        >
          <input
            type="text"
            placeholder="New habit…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{
              flex: 1,
              padding: '4px 8px',
              background: 'transparent',
              border: '1px solid var(--paper-3)',
              borderRadius: 'var(--radius)',
              fontFamily: 'var(--font-sans)',
              fontSize: 11.5,
              color: 'var(--ink-2)',
              outline: 'none',
              minWidth: 0,
            }}
          />
          <button
            type="button"
            onClick={handleAddHabit}
            style={{
              padding: '4px 10px',
              background: 'transparent',
              border: '1px solid var(--paper-3)',
              borderRadius: 'var(--radius)',
              fontFamily: 'var(--font-mono)',
              fontSize: 10.5,
              letterSpacing: '0.04em',
              color: 'var(--ink-2)',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            ADD
          </button>
        </div>
      </div>
    </div>
  );
}
