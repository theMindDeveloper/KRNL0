export interface CalendarEvent {
  date: string;   // YYYY-MM-DD
  title: string;
  color?: string;
}

export interface CalendarState {
  month: number;  // 0-11
  year: number;
  events: CalendarEvent[];
}

export interface CalendarConfig {
  firstDay?: 0 | 1; // 0 = Sunday, 1 = Monday
}

export const defaultCalendarState = (): CalendarState => {
  const now = new Date();
  return {
    month: now.getMonth(),
    year: now.getFullYear(),
    events: [],
  };
};

export const defaultCalendarConfig = (): CalendarConfig => ({
  firstDay: 1,
});
