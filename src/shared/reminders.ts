// Reminders (review 4.1): "remind me 10 minutes before the dentist call".
// Opt-in per plan (TaskState.remindMin). Pure: the main process asks which
// reminders fall in (fromMs, toMs] and shows them, window open or not.

import type { Board } from './types';
import { selectSchedule } from '../renderer/store/scheduleSelector';
import { routineOccurrence, type Habit } from '../renderer/components/nodes/HabitNode/types';

const pad = (n: number) => String(n).padStart(2, '0');
const ymdOf = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

export interface Reminder {
  /** Stable per plan + start + lead, so one reminder never shows twice. */
  key: string;
  taskId: string;
  title: string;
  body: string;
  atMs: number;
}

/** "in 10 min" / "now" — the lead time in words. */
export function leadWords(min: number): string {
  if (min <= 0) return 'now';
  if (min < 60) return `in ${min} min`;
  return min % 60 ? `in ${Math.floor(min / 60)} h ${min % 60} min` : `in ${min / 60} h`;
}

export function dueReminders(board: Board | null, fromMs: number, toMs: number): Reminder[] {
  if (!board) return [];
  const { placements } = selectSchedule(board);
  const out: Reminder[] = [];
  for (const node of board.nodes) {
    if (node.kind !== 'todo.task') continue;
    const s = node.state as { text?: unknown; done?: unknown; remindMin?: unknown } | null;
    if (!s || s.done === true) continue;
    const lead = s.remindMin;
    if (typeof lead !== 'number' || !Number.isFinite(lead) || lead < 0) continue;
    const p = placements.get(node.id);
    if (!p) continue;
    const startMs = new Date(p.startISO).getTime();
    const atMs = startMs - lead * 60_000;
    if (!(atMs > fromMs && atMs <= toMs)) continue;
    const text = typeof s.text === 'string' && s.text.trim() ? s.text.trim() : 'A plan';
    out.push({
      key: `${node.id}@${p.startISO}-${lead}`,
      taskId: node.id,
      title: text,
      body: `Starts ${leadWords(lead)} · ${p.startISO.slice(11, 16)}`,
      atMs,
    });
  }
  // Routines ("remind me before class"): each occurrence that is not skipped.
  for (const node of board.nodes) {
    if (node.kind !== 'habit') continue;
    const habits = ((node.state as { habits?: unknown } | null)?.habits ?? []) as Habit[];
    if (!Array.isArray(habits)) continue;
    for (const h of habits) {
      const lead = h.remindMin;
      if (h.kind !== 'routine' || typeof lead !== 'number' || lead < 0) continue;
      // The occurrence can be today or tomorrow (a 23:55 check, 10 min before 00:05).
      const days = new Set([ymdOf(fromMs), ymdOf(toMs), ymdOf(toMs + lead * 60_000)]);
      for (const ymd of days) {
        const occ = routineOccurrence(h, ymd);
        if (!occ || occ.skipped) continue;
        const startMs = new Date(`${ymd}T${pad(Math.floor(occ.startMin / 60))}:${pad(occ.startMin % 60)}:00`).getTime();
        const atMs = startMs - lead * 60_000;
        if (!(atMs > fromMs && atMs <= toMs)) continue;
        out.push({
          key: `${h.id}@${ymd}T${occ.startMin}-${lead}`,
          taskId: h.id,
          title: h.name,
          body: `Starts ${leadWords(lead)} · ${pad(Math.floor(occ.startMin / 60))}:${pad(occ.startMin % 60)}`,
          atMs,
        });
      }
    }
  }
  return out.sort((a, b) => a.atMs - b.atMs);
}
