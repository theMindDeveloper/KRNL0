// Decision #11 — HabitNode state contract.
// Persistence rule: store a sparse log of YYYY-MM-DD strings (local time).
// Week grid and streak are always derived at render time — never stored.

export interface Habit {
  id: string;          // crypto.randomUUID()
  name: string;
  createdAt: string;   // ISO 8601
  log: string[];       // ['2026-05-10', '2026-05-09', ...] — sorted desc, unique, local YYYY-MM-DD
  archived: boolean;   // default false; archived habits hidden from grid
}

export interface HabitState {
  habits: Habit[];
}

export interface HabitConfig {
  weekStartsOn: 'monday'; // locked for v1 (Decision #11)
}

export const defaultHabitState = (): HabitState => ({ habits: [] });

export const defaultHabitConfig = (): HabitConfig => ({ weekStartsOn: 'monday' });

// Returns YYYY-MM-DD in local time for the given Date.
export function toYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Returns today's date as YYYY-MM-DD in local time.
export function todayLocal(): string {
  return toYMD(new Date());
}

// Returns a new Date set to the Monday of the week containing `date` (local time).
export function getMondayOf(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diff = day === 0 ? -6 : 1 - day; // days to subtract to reach Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Returns YYYY-MM-DD for each of Mon–Sun of the week that contains `date`.
export function getWeekDays(date: Date): string[] {
  const monday = getMondayOf(date);
  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    days.push(toYMD(d));
  }
  return days;
}

// Returns the YYYY-MM-DD for the day before `dateStr`.
export function prevDay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() - 1);
  return toYMD(d);
}
