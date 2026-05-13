export interface ClockState {
  linkedTodoId: string | null; // which Todo node to pull tasks from
  windowStartHour: number;     // 0-23, hour at the 12-o'clock anchor; default 8
}

export type ClockConfig = Record<string, never>;

export const defaultClockState = (): ClockState => ({
  linkedTodoId: null,
  windowStartHour: 8,
});

export const defaultClockConfig = (): ClockConfig => ({});
