// HabitLaneNode — pointer to a habit in the mother HabitNode.
// The lane owns NO mutable habit data: log + name + color + icon are read
// from the mother's state at render time. Decision 14.1 (v2.2).

export interface HabitLaneState {
  habitId: string;     // id of the habit in mother-habit.state.habits
}

export interface HabitLaneConfig {
  days: number;        // sparkline window (default 28)
}

export const defaultHabitLaneState = (habitId = ''): HabitLaneState => ({ habitId });
export const defaultHabitLaneConfig = (): HabitLaneConfig => ({ days: 28 });
