// Reminders (review 4.1): "remind me 10 minutes before the dentist call".
// Opt-in per plan (TaskState.remindMin). Pure: the main process asks which
// reminders fall in (fromMs, toMs] and shows them, window open or not.

import type { Board } from './types';
import { selectSchedule } from '../renderer/store/scheduleSelector';

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
  return out.sort((a, b) => a.atMs - b.atMs);
}
