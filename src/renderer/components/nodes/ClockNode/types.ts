export interface ClockState {
  linkedTodoId: string | null; // which Todo node to pull tasks from
  viewWindow: 0 | 1;           // 0 = minutes [0, 720); 1 = minutes [720, 1440)
}

export type ClockConfig = Record<string, never>;

export const defaultClockState = (): ClockState => ({
  linkedTodoId: null,
  viewWindow: 0,
});

export const defaultClockConfig = (): ClockConfig => ({});
