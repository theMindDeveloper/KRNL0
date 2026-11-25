// Drag to add (owner pick, canvas "KRNL0 Drag to add time", draft B,
// calendar-clock-visuals F93). Press on empty time and drag: the box grows
// with you; let go and this small card opens beside it.
//   - The box is in the future (or reaches past now): a name field, the day and
//     times, and one row Task · Event · Repeats (owner pick, canvas "Task or
//     event B", 2026-11-25). Task: a plan in Todo at that time (ticked, Pomo
//     can focus on it). Event: once on that day. Repeats: an event on the days
//     picked. The row remembers the last pick.
//   - The box is all in the past: logged time. The same "what was it" field
//     as Log past time (names you used come back, a kind pill), Log <length>.
// Enter adds, Esc or a click away cancels. Right-click keeps the exact-time cards.

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Z } from '../../ui/layers';
import { pickerOpen } from '../../ui/Popover';
import { useOneOverlay } from '../../ui/oneOverlay';
import { DoingList, type DoingChoice } from '../PomoNode/DoingPicker';
import { useBoardStore } from '../../../store/boardStore';
import { spanTaskTargets } from '../PomoNode/taskTargets';
import { boardTagLibrary } from '../../../store/spanTags';
import { KindIcon, type ItemKind } from '../../ui/kindIcons';

export const CARD_W = 300;
const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export const hmOfMin = (m: number): string => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export function lengthLabel(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h && m ? `${h}h ${String(m).padStart(2, '0')}` : h ? `${h}h` : `${m} min`;
}

export interface DragAddCardProps {
  /** Screen spot for the card's top-left (beside the box). */
  x: number;
  y: number;
  /** YYYY-MM-DD of the box. */
  day: string;
  startMin: number;
  endMin: number;
  /** All of it before now: logged time, not an event. */
  past: boolean;
  onAddEvent: (d: { name: string; mode: 'once' | 'repeat'; days: number[] }) => void;
  /** A plan (a task in Todo) at the box's time. Without it the card makes events only. */
  onAddTask?: (name: string) => void;
  /** Logs the time; returns why it could not (the card stays open and says so), or null. */
  onLog: (c: DoingChoice) => string | null;
  onClose: () => void;
}

type AddKind = 'task' | 'once' | 'repeat';
const KIND_KEY = 'krnl0-drag-add-kind';
function loadKind(): AddKind {
  try { const v = localStorage.getItem(KIND_KEY); return v === 'task' || v === 'repeat' ? v : 'once'; } catch { return 'once'; }
}
function saveKind(k: AddKind): void {
  try { localStorage.setItem(KIND_KEY, k); } catch { /* private window: not remembered */ }
}

export function DragAddCard({ x, y, day, startMin, endMin, past, onAddEvent, onAddTask, onLog, onClose }: DragAddCardProps): JSX.Element {
  // One card or menu at a time (the owner's rule): opening this closes the others.
  useOneOverlay(true, onClose);
  const isoDow = ((new Date(`${day}T00:00:00`).getDay() + 6) % 7) + 1;
  const [name, setName] = useState('');
  const [mode, setModeRaw] = useState<AddKind>(() => { const k = loadKind(); return k === 'task' && !onAddTask ? 'once' : k; });
  const setMode = (k: AddKind): void => { setModeRaw(k); saveKind(k); };
  const [days, setDays] = useState<number[]>([isoDow]);
  const [logError, setLogError] = useState<string | null>(null);
  const nodes = useBoardStore((s) => s.board?.nodes);
  const tasks = useMemo(() => spanTaskTargets(nodes), [nodes]);
  const todoNode = useBoardStore((st) => st.board?.nodes.find((n) => n.kind === 'todo' && n.isMother));
  const library = useMemo(() => boardTagLibrary(todoNode ? { nodes: [todoNode] } : null), [todoNode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape' && !pickerOpen()) { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const dayWord = (d: Date) => d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' });
  const startDate = new Date(`${day}T00:00:00`);
  // Past midnight: the day it ends on too ("Tue 25 → Wed 26").
  const dayLabel = endMin > 1440 ? `${dayWord(startDate)} → ${dayWord(new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + Math.floor((endMin - 1) / 1440)))}` : dayWord(startDate);
  const len = endMin - startMin;
  const canAdd = !!name.trim() && (mode !== 'repeat' || days.length > 0);
  const add = (): void => {
    if (!canAdd) return;
    if (mode === 'task' && onAddTask) onAddTask(name.trim());
    else onAddEvent({ name: name.trim(), mode: mode === 'repeat' ? 'repeat' : 'once', days });
  };
  const kinds: Array<{ k: AddKind; label: string; icon: ItemKind }> = [
    ...(onAddTask ? [{ k: 'task' as const, label: 'Task', icon: 'task' as const }] : []),
    { k: 'once', label: 'Event', icon: 'event' },
    { k: 'repeat', label: 'Repeats', icon: 'repeat' },
  ];
  const left = Math.max(8, Math.min(x, window.innerWidth - CARD_W - 8));
  const top = Math.max(8, Math.min(y, window.innerHeight - (past ? 260 : 220)));
  const seg = (on: boolean): React.CSSProperties => ({ flex: 1, height: 24, border: 'none', borderRadius: 6, cursor: 'pointer', background: on ? 'var(--paper-3)' : 'transparent', color: on ? 'var(--ink)' : 'var(--ink-3)', fontFamily: 'var(--font-read)', fontSize: 12 });

  return createPortal(
    <>
      <div onMouseDown={(e) => { e.stopPropagation(); onClose(); }} onContextMenu={(e) => { e.preventDefault(); onClose(); }} style={{ position: 'fixed', inset: 0, zIndex: Z.popupBackdrop }} />
      <div
        role="dialog"
        aria-label={past ? 'Log this time' : mode === 'task' ? 'New task' : 'New event'}
        data-testid="cal-drag-card"
        data-owns-keys="true"
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          position: 'fixed', left, top, zIndex: Z.popup, width: CARD_W, boxSizing: 'border-box', padding: past ? 4 : 10,
          display: 'flex', flexDirection: 'column', gap: 8, borderRadius: 12, background: 'var(--paper)', border: '1px solid var(--paper-3)', boxShadow: 'var(--shadow-2)', fontFamily: 'var(--font-read)',
        }}
      >
        <div data-testid="cal-drag-when" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: past ? '6px 8px 0' : '0 4px', fontSize: 12.5 }}>
          <span style={{ color: 'var(--ink-3)' }}>{dayLabel}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--ink)' }}>{hmOfMin(startMin)} → {hmOfMin(endMin)} <span style={{ color: 'var(--ink-3)' }}>· {lengthLabel(len)}</span></span>
        </div>
        {past ? (
          <>
            <DoingList testIdPrefix="cal-drag" width="100%" current={null} tasks={tasks} library={library} pastTime onPick={(c) => setLogError(onLog(c))} onClose={onClose} />
            {logError && <span role="alert" data-testid="cal-drag-error" style={{ margin: '0 6px', padding: '8px 10px', borderRadius: 8, background: 'color-mix(in srgb, var(--rust) 12%, transparent)', fontSize: 12.5, color: 'var(--ink)' }}>{logError}</span>}
            <span style={{ padding: '0 10px 6px', fontSize: 11, color: 'var(--ink-4)' }}>Past time: picking a name logs it (what is already recorded there stays)</span>
          </>
        ) : (
          <>
            <input
              data-testid="cal-drag-name"
              aria-label={mode === 'task' ? 'Task name' : 'Event name'}
              autoFocus
              value={name}
              placeholder="Name it"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); add(); } if (e.key === 'Escape') onClose(); }}
              style={{ height: 34, boxSizing: 'border-box', padding: '0 10px', borderRadius: 8, border: 'none', background: 'var(--paper-2)', color: 'var(--ink)', fontFamily: 'var(--font-read)', fontSize: 13, fontWeight: 600, outline: 'none' }}
            />
            <div role="tablist" aria-label="What it is" style={{ display: 'flex', gap: 2, padding: 3, borderRadius: 8, background: 'var(--paper-2)' }}>
              {kinds.map(({ k, label, icon }) => (
                <button key={k} type="button" role="tab" aria-selected={mode === k} data-testid={`cal-drag-${k}`} onClick={() => setMode(k)}
                  title={k === 'task' ? 'A task: in Todo, you tick it, Pomo can focus on it' : k === 'once' ? 'An event: it just happens, once' : 'An event on the days you pick'}
                  style={{ ...seg(mode === k), display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                  <KindIcon kind={icon} size={12} />{label}
                </button>
              ))}
            </div>
            {mode === 'repeat' && (
              <div role="group" aria-label="Days" style={{ display: 'flex', justifyContent: 'space-between', padding: '0 2px' }}>
                {LETTERS.map((l, i) => {
                  const d = i + 1;
                  const on = days.includes(d);
                  return (
                    <button key={d} type="button" aria-label={NAMES[i]} aria-pressed={on} data-testid={`cal-drag-day-${d}`}
                      onClick={() => setDays((xs) => (on ? xs.filter((v) => v !== d) : [...xs, d].sort()))}
                      style={{ width: 30, height: 30, borderRadius: 999, border: 'none', cursor: 'pointer', fontFamily: 'var(--font-read)', fontSize: 12, fontWeight: 600, background: on ? 'var(--btn-primary-bg)' : 'var(--paper-2)', color: on ? 'var(--btn-primary-fg)' : 'var(--ink-3)' }}>
                      {l}
                    </button>
                  );
                })}
              </div>
            )}
            <button type="button" data-testid="cal-drag-add" disabled={!canAdd} onClick={add}
              style={{ height: 32, border: 'none', borderRadius: 8, cursor: canAdd ? 'pointer' : 'default', background: canAdd ? 'var(--btn-primary-bg)' : 'var(--paper-2)', color: canAdd ? 'var(--btn-primary-fg)' : 'var(--ink-4)', fontFamily: 'var(--font-read)', fontSize: 13, fontWeight: 600 }}>
              {mode === 'task' ? <>Add task <span style={{ fontWeight: 500, opacity: 0.72 }}>· to Todo</span></> : 'Add event'}
            </button>
          </>
        )}
      </div>
    </>,
    document.body,
  );
}
