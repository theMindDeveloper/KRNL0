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

// Round-robin glyphs per habit index — cosmetic only, no schema change.
const GLYPHS = ['✎', '↗', '◍', '⌬', '◆', '▷', '○'];

const CELL_SIZE = 18;
const CELL_GAP = 3;

import { MotherFrame, MOTHER_WIDTH, MOTHER_TOTAL } from '../MotherFrame';

export function HabitNode({ node, onCommand, slotIndex = 3, slotTotal = MOTHER_TOTAL, onMoveLeft, onMoveRight }: NodeProps<HabitState, HabitConfig>) {
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
    <MotherFrame slotIndex={slotIndex} slotTotal={slotTotal} width={MOTHER_WIDTH} onMoveLeft={onMoveLeft} onMoveRight={onMoveRight}>
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
              {DAY_LABELS.map((label, i) => (
                <div
                  key={i}
                  style={{
                    width: CELL_SIZE,
                    textAlign: 'center',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 8.5,
                    color: 'var(--ink-4)',
                    letterSpacing: '0.04em',
                  }}
                >
                  {label}
                </div>
              ))}
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
            visibleHabits.map((habit, habitIdx) => {
              const streak = calcStreak(habit.log, today);
              const glyph = GLYPHS[habitIdx % GLYPHS.length] ?? '●';
              const isLast = habitIdx === visibleHabits.length - 1;

              return (
                <div
                  key={habit.id}
                  style={{
                    paddingBottom: 8,
                    paddingTop: habitIdx === 0 ? 0 : 8,
                    borderBottom: isLast ? 'none' : '1px dashed var(--paper-2)',
                  }}
                >
                  {/* Row top: glyph + name + grid */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    {/* Glyph */}
                    <span
                      style={{
                        width: 14,
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11,
                        color: 'var(--ink-3)',
                        flexShrink: 0,
                        lineHeight: 1,
                      }}
                    >
                      {glyph}
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

                        // Cell style matrix per spec:
                        // done + today:   acid bg + 1px acid outline 1px outside the cell
                        // done + past:    acid bg at 0.85 opacity
                        // today undone:   1px ink-3 border + 1px acid outline 1px outside
                        // past undone:    paper-3 bg, opacity 0.4
                        // future:         paper-3 bg (non-interactive, no special styling)
                        //
                        // "1px outline outside" is implemented as CSS `outline: 1px solid …`
                        // with `outlineOffset: 1px` — this draws a 1px ring with a 1px gap
                        // between it and the cell border.
                        let cellBg: string;
                        let cellOpacity: number | undefined;
                        let cellBorder: string;
                        let cellOutline: string | undefined;
                        let cellOutlineOffset: string | undefined;

                        if (done && isToday) {
                          cellBg = 'var(--acid)';
                          cellBorder = '1px solid transparent';
                          cellOutline = '1px solid var(--acid)';
                          cellOutlineOffset = '1px';
                        } else if (done && isPast) {
                          cellBg = 'var(--acid)';
                          cellOpacity = 0.85;
                          cellBorder = '1px solid transparent';
                        } else if (isToday) {
                          // today undone: ink-3 border + acid outline ring outside
                          cellBg = 'transparent';
                          cellBorder = '1px solid var(--ink-3)';
                          cellOutline = '1px solid var(--acid)';
                          cellOutlineOffset = '1px';
                        } else if (isPast) {
                          cellBg = 'var(--paper-3)';
                          cellOpacity = 0.4;
                          cellBorder = '1px solid transparent';
                        } else {
                          // future
                          cellBg = 'var(--paper-3)';
                          cellBorder = '1px solid transparent';
                        }

                        const cellStyle: React.CSSProperties = {
                          width: CELL_SIZE,
                          height: CELL_SIZE,
                          border: cellBorder,
                          borderRadius: 3,
                          background: cellBg,
                          flexShrink: 0,
                          boxSizing: 'border-box',
                          ...(cellOpacity !== undefined ? { opacity: cellOpacity } : {}),
                          ...(cellOutline ? { outline: cellOutline } : {}),
                          ...(cellOutlineOffset ? { outlineOffset: cellOutlineOffset } : {}),
                        };

                        if (isToday) {
                          return (
                            <button
                              key={dayStr}
                              type="button"
                              data-cell-state={done ? 'done-today' : 'today'}
                              title={`${habit.name} ${dayStr} — click to toggle`}
                              onClick={() =>
                                onCommand('habit.toggleDay', { id: habit.id, date: dayStr })
                              }
                              style={{
                                ...cellStyle,
                                cursor: 'pointer',
                                padding: 0,
                              }}
                              aria-label={`${habit.name} ${dayStr} ${done ? 'done' : 'not done'}`}
                              aria-pressed={done}
                            />
                          );
                        }

                        // Non-today: read-only, non-interactive
                        const pastState = done
                          ? 'done-past'
                          : isPast
                            ? 'past'
                            : 'future';
                        return (
                          <div
                            key={dayStr}
                            data-cell-state={pastState}
                            title={`${habit.name} ${dayStr} ${done ? 'done' : 'not done'}`}
                            style={{
                              ...cellStyle,
                              cursor: 'default',
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>

                  {/* Streak indicator */}
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
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>
      </div>
    </MotherFrame>
  );
}
