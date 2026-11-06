// Which sound moment a UI action was (docs/06-requirements/ui-sounds.md F3).
// Read from what changed on the board — not from the command name — so every
// path that does the same thing sounds the same. Pure; unit-tested.

import type { Board } from '../../shared/types';
import type { SoundMoment } from './soundPacks';

export interface SoundSnapshot {
  /** Done tasks + done to-do items. */
  done: number;
  /** Tasks + to-do items + habits. */
  items: number;
  /** Habit check-ins (all days, all habits). */
  checkins: number;
  /** Per pomo node: status and completed sessions. */
  pomos: Record<string, { status: string; sessions: number }>;
  /** Task / to-do item id -> its scheduled time (only scheduled ones). */
  scheduled: Record<string, string>;
}

type Loose = Record<string, unknown>;
const asObj = (v: unknown): Loose => (v && typeof v === 'object' ? (v as Loose) : {});
const asArr = (v: unknown): Loose[] => (Array.isArray(v) ? (v as Loose[]) : []);

export function soundSnapshot(board: Pick<Board, 'nodes'> | null | undefined): SoundSnapshot {
  const snap: SoundSnapshot = { done: 0, items: 0, checkins: 0, pomos: {}, scheduled: {} };
  for (const node of board?.nodes ?? []) {
    const state = asObj(node.state);
    if (node.kind === 'todo.task') {
      snap.items += 1;
      if (state['done'] === true) snap.done += 1;
      if (typeof state['scheduledFor'] === 'string' && state['scheduledFor']) snap.scheduled[node.id] = state['scheduledFor'];
    } else if (node.kind === 'todo') {
      for (const item of asArr(state['items'])) {
        snap.items += 1;
        if (item['done'] === true) snap.done += 1;
        if (typeof item['scheduledFor'] === 'string' && item['scheduledFor'] && typeof item['id'] === 'string') {
          snap.scheduled[`item:${item['id']}`] = item['scheduledFor'];
        }
      }
    } else if (node.kind === 'habit') {
      for (const habit of asArr(state['habits'])) {
        snap.items += 1;
        snap.checkins += asArr(habit['log']).length;
      }
    } else if (node.kind === 'pomo') {
      snap.pomos[node.id] = {
        status: typeof state['status'] === 'string' ? state['status'] : 'idle',
        sessions: typeof state['sessionsCompleted'] === 'number' ? state['sessionsCompleted'] : 0,
      };
    }
  }
  return snap;
}

function pomoMoment(before: SoundSnapshot, after: SoundSnapshot): SoundMoment | null {
  for (const [id, a] of Object.entries(after.pomos)) {
    const b = before.pomos[id];
    if (!b) continue;
    if (a.sessions > b.sessions) return 'sessionDone';
    if (a.status === b.status) continue;
    const working = (s: string) => s === 'running' || s === 'paused';
    if (a.status === 'running') {
      if (b.status === 'paused' || b.status === 'break') return 'resume';
      return 'start';
    }
    if (a.status === 'paused') return 'pause';
    if (a.status === 'break') return 'break';
    if ((a.status === 'idle' || a.status === 'done') && (working(b.status) || b.status === 'break')) return 'stop';
  }
  return null;
}

function planned(before: SoundSnapshot, after: SoundSnapshot): boolean {
  return Object.entries(after.scheduled).some(([id, at]) => before.scheduled[id] !== at);
}

/**
 * The moment for a before/after pair, or null when nothing worth a sound
 * changed. Order matters: ticking a task done can also stop the timer — the
 * user did "done", so done wins.
 */
export function momentFromChange(before: SoundSnapshot, after: SoundSnapshot): SoundMoment | null {
  if (after.done > before.done) return 'done';
  if (after.done < before.done && after.items >= before.items) return 'reopen';
  const pomo = pomoMoment(before, after);
  if (pomo) return pomo;
  if (after.checkins > before.checkins) return 'habit';
  if (after.checkins < before.checkins && after.items >= before.items) return 'unhabit';
  if (planned(before, after)) return 'plan';
  if (after.items > before.items) return 'add';
  if (after.items < before.items) return 'delete';
  return null;
}

// Only these command families can make a sound; the rest (view changes,
// sizes, per-second time keeping) skip the snapshot entirely.
const SOUND_FAMILIES = /^(todo|task|pomo|habit|calendar\.schedule)/;
const NEVER = /^(task\.(accumulateSeconds|setCurrentSessionElapsedSec|clearCurrentSessionElapsedSec|edit|setNote)|todo\.(edit|setItemTag|reclassify)|pomo\.(setLiveLabel|setConfig|setFace|dev|tag$)|habit\.(rename|setColor|setIcon|setNote|setView))/;

export function commandCanSound(command: string): boolean {
  return SOUND_FAMILIES.test(command) && !NEVER.test(command);
}
