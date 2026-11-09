// Decision 40 — adding a plan opens the same plan card as a row's When… and a
// Calendar block (ui/WhenPopover, controlled while adding). These helpers merge
// what the typed words say with what was set on the card, and word the button.

import { dayWord, fmtLength } from '../../ui/WhenPopover';

export interface PlanDraft {
  day: string | null;
  time: string | null;
  lengthMin: number | null;
  deadline: string | null;
  remindMin?: number | null;
}

/** What the user changed on the card; undefined = take it from the words. */
export type PlanOverrides = Partial<PlanDraft>;

export function effectiveDraft(fromWords: PlanDraft, ov: PlanOverrides): PlanDraft {
  const day = ov.day !== undefined ? ov.day : fromWords.day;
  const time = ov.time !== undefined ? ov.time : fromWords.time;
  return {
    day: day ?? (time ? fromWords.day : null),
    time: day ? time : null,
    lengthMin: ov.lengthMin !== undefined ? ov.lengthMin : fromWords.lengthMin,
    deadline: ov.deadline !== undefined ? ov.deadline : fromWords.deadline,
    ...(ov.remindMin !== undefined ? { remindMin: ov.remindMin } : {}),
  };
}

/** "Fri 16:00 · 1h · by Sat" — the button's words. */
export function draftSummary(d: PlanDraft, today: string): string {
  const parts: string[] = [];
  if (d.day) parts.push(d.time ? `${d.day === today ? 'today' : dayWord(d.day, today)} ${d.time}` : `${dayWord(d.day, today)}, any time`);
  if (d.lengthMin) parts.push(fmtLength(d.lengthMin));
  if (d.deadline) parts.push(`by ${dayWord(d.deadline, today)}`);
  return parts.join(' · ');
}
