// Decision #11 — HabitNode component.
// Week grid and streak are derived at render time from the sparse log.
// weekStart is computed (not stored) as the most recent Monday in local time.
// All state mutations go through onCommand.

import { useState } from 'react';
import type { NodeProps } from '../types';
import type { HabitConfig, HabitState } from './types';
import { getWeekDays, todayLocal } from './types';
import { calcStreak } from './commands';

// Inline ISO week computation — no external dep needed.
function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7; // ISO: Mon=1 ... Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const CELL_SIZE = 18;
const CELL_GAP = 3;

import { MotherFrame, MOTHER_WIDTH, MOTHER_TOTAL } from '../MotherFrame';

const SLOT_INDEX = 3;

export function HabitNode({ node, onCommand }: NodeProps<HabitState, HabitConfig>) {
  const { state } = node;
  const [newName, setNewName] = useState('');

  const today = todayLocal();
  const now = new Date();
  const weekDays = getWeekDays(now);
  const weekNum = getISOWeek(now);

  const visibleHabits = state.habits.filter((h) => !h.archived);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const trimmed = newName.trim();
      if (!trimmed) return;
      onCommand('habit.add', { name: trimmed });
      setNewName('');
    }
  };

  // Grid dimensions: 7 cells × 18px + 6 gaps × 3px = 144px
  const gridWidth = CELL_SIZE * 7 + CELL_GAP * 6;

  return (
    <MotherFrame slotIndex={SLOT_INDEX} slotTotal={MOTHER_TOTAL} width={MOTHER_WIDTH}>
      <div style={{ overflow: 'hidden', borderRadius: 6 }}>
        {/* Header */}
        <div
          style={{
            padding: '7px 16px 6px',
            borderBottom: '1px solid var(--paper-3)',
            fontFamily: 'var(--font-mono)',
            fontSize: 10.5,
            color: 'var(--ink-3)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span style={{ color: 'var(--rust)' }}>●</span>
          {`HABITS — WEEK ${weekNum} · HBT.WEEK`}
        </div>

        {/* Body */}
        <div style={{ padding: '14px 16px' }}>
          {/* Day labels row — right-aligned over the 7-cell grid */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              marginBottom: 8,
            }}
          >
            <div style={{ display: 'flex', gap: CELL_GAP, width: gridWidth }}>
              {DAY_LABELS.map((label, i) => {
                const isToday = weekDays[i] === today;
                return (
                  <div
                    key={i}
                    style={{
                      width: CELL_SIZE,
                      textAlign: 'center',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 8.5,
                      color: isToday ? 'var(--acid)' : 'var(--ink-4)',
                      letterSpacing: '0.04em',
                    }}
                  >
                    {label}
                  </div>
                );
              })}
            </div>
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
                <div key={habit.id} style={{ marginBottom: 10 }}>
                  {/* Row top: icon + name + grid */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    {/* Icon */}
                    <span
                      style={{
                        width: 14,
                        height: 14,
                        fontFamily: 'var(--font-mono)',
                        fontSize: 10,
                        color: 'var(--ink-3)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {'●'}
                    </span>

                    {/* Name */}
                    <div
                      style={{
                        flex: 1,
                        minWidth: 0,
                        fontSize: 13,
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

                    {/* 7-day cell grid */}
                    <div style={{ display: 'flex', gap: CELL_GAP, flexShrink: 0 }}>
                      {weekDays.map((dayStr) => {
                        const done = habit.log.includes(dayStr);
                        const isToday = dayStr === today;
                        const isPast = dayStr < today;

                        let cellBackground: string;
                        let cellBorder: string;

                        if (done) {
                          // Done state: acid fill, regardless of today/past
                          cellBackground = 'var(--acid)';
                          cellBorder = '1px solid transparent';
                        } else if (isToday) {
                          // Today, not done: slightly more visible border
                          cellBackground = 'transparent';
                          cellBorder = '1px solid var(--ink-3)';
                        } else if (isPast) {
                          // Past, not done: subtle border
                          cellBackground = 'transparent';
                          cellBorder = '1px solid var(--paper-3)';
                        } else {
                          // Future: subtle border
                          cellBackground = 'transparent';
                          cellBorder = '1px solid var(--paper-3)';
                        }

                        // Today indicator: thin acid outline outside the cell
                        const todayOutline = isToday
                          ? { outline: '1px solid var(--acid)', outlineOffset: '1px' }
                          : {};

                        if (isToday) {
                          // Today's cell: clickable, toggles done state
                          return (
                            <button
                              key={dayStr}
                              type="button"
                              title={`${habit.name} ${dayStr} — click to toggle`}
                              onClick={() =>
                                onCommand('habit.toggleDay', { id: habit.id, date: dayStr })
                              }
                              style={{
                                width: CELL_SIZE,
                                height: CELL_SIZE,
                                border: cellBorder,
                                borderRadius: 3,
                                background: cellBackground,
                                cursor: 'pointer',
                                padding: 0,
                                flexShrink: 0,
                                ...todayOutline,
                              }}
                              aria-label={`${habit.name} ${dayStr} ${done ? 'done' : 'not done'}`}
                              aria-pressed={done}
                            />
                          );
                        }

                        // Non-today cells: read-only div
                        return (
                          <div
                            key={dayStr}
                            title={`${habit.name} ${dayStr} ${done ? 'done' : 'not done'}`}
                            style={{
                              width: CELL_SIZE,
                              height: CELL_SIZE,
                              border: cellBorder,
                              borderRadius: 3,
                              background: cellBackground,
                              flexShrink: 0,
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>

                  {/* Row bottom: streak indicator, indented */}
                  <div
                    style={{
                      marginTop: 3,
                      paddingLeft: 20,
                      fontFamily: 'var(--font-mono)',
                      fontSize: 9.5,
                      color: streak > 0 ? 'var(--acid)' : 'var(--rust)',
                      letterSpacing: '0.04em',
                    }}
                  >
                    {`▲ ${streak} day streak`}
                  </div>
                </div>
              );
            })
          )}

          {/* Add habit input */}
          <div
            style={{
              marginTop: 10,
              borderTop: '1px solid var(--paper-3)',
              paddingTop: 10,
            }}
          >
            <input
              type="text"
              placeholder="+ add habit"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={handleKeyDown}
              style={{
                width: '100%',
                padding: '4px 0',
                background: 'transparent',
                border: 'none',
                borderBottom: '1px solid var(--paper-3)',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'var(--ink-3)',
                outline: 'none',
                minWidth: 0,
              }}
            />
          </div>
        </div>
      </div>
    </MotherFrame>
  );
}
