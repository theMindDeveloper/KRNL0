export interface ClockState {
  linkedTodoId: string | null; // which Todo node to pull tasks from
  viewWindow: 0 | 1;           // 0 = minutes [0, 720); 1 = minutes [720, 1440)
  /** ADR 0004 §3 — selected day for wall-clock projection.
   *  YYYY-MM-DD, local. Independent of CalendarState (each viewer owns
   *  its own temporal cursor — §3.1). */
  selectedDate: string;
  /** Show only the dial, as big as the window allows (hides bars and list). */
  dialOnly?: boolean;
  /** #207 — show the last 7 days as small static dials instead of one day. */
  weekView?: boolean;
}

export type ClockConfig = Record<string, never>;

/** ADR 0004 §3 — local-time YYYY-MM-DD for today. Renderer-side mirror of
 *  the helper in `src/main/persistence/board.ts`. */
export function todayLocalYMD(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const defaultClockState = (): ClockState => ({
  linkedTodoId: null,
  viewWindow: 0,
  selectedDate: todayLocalYMD(),
});

export const defaultClockConfig = (): ClockConfig => ({});
