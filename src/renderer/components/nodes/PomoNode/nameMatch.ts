// time-log F22 — names you used come back, and match as you type.
//
// Free time adds up by its name in Analytics (case and spaces ignored), so
// "AOE2" and "Age of Empires 2" are two rows. The picker offers the names you
// already used and finds them from a few letters — "aoe" (initials), "emp"
// (a word start), "pires" (inside) — so the same name is picked again instead
// of retyped. Pure functions; the list (DoingList) and Analytics' merge use them.

/** The key a name adds up under (time log fold: `label:<trimmed lower>`). */
export function nameKey(label: string): string {
  return label.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** First letter or digit of each word: "Age of Empires 2" → "aoe2". */
export function initialsOf(label: string): string {
  return (label.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).map((w) => w[0]).join('');
}

/**
 * How well `query` finds `label`: 0 = not at all; higher is better.
 * Exact > starts with > a word starts with > initials > anywhere inside.
 */
export function nameScore(query: string, label: string): number {
  const q = nameKey(query);
  const l = nameKey(label);
  if (!q || !l) return 0;
  if (l === q) return 100;
  if (l.startsWith(q)) return 80;
  if (l.split(/[^\p{L}\p{N}]+/u).some((w) => w.startsWith(q))) return 60;
  const compact = q.replace(/[^\p{L}\p{N}]/gu, '');
  if (compact.length >= 2 && initialsOf(label).startsWith(compact)) return 50;
  if (l.includes(q)) return 30;
  return 0;
}

export interface UsedName {
  label: string;
  /** Kind of work it was filed under last (free names only). */
  tag: string | null;
  taskId: string | null;
  /** Minutes recorded under it. */
  minutes: number;
}

interface HistoryRecord {
  label?: string;
  tag?: string | null;
  taskId?: string | null;
  kind?: string;
  durationMin?: number;
  startedAt?: string;
}

/**
 * Names used in recorded time, newest first, one per name (tasks by id, free
 * names by their key; the newest spelling and kind win), with their minutes.
 */
export function usedNames(history: readonly HistoryRecord[]): UsedName[] {
  const out = new Map<string, UsedName>();
  for (let i = history.length - 1; i >= 0; i--) {
    const r = history[i]!;
    if (r.kind === 'break') continue;
    const label = (r.label ?? '').trim();
    if (!r.taskId && !label) continue;
    const key = r.taskId ? `t:${r.taskId}` : `n:${nameKey(label)}`;
    const seen = out.get(key);
    if (seen) { seen.minutes += r.durationMin ?? 0; continue; }
    out.set(key, { label, tag: r.taskId ? null : r.tag ?? null, taskId: r.taskId ?? null, minutes: r.durationMin ?? 0 });
  }
  return [...out.values()];
}
