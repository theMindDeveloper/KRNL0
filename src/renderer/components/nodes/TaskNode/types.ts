export interface TaskState {
  text: string;
  done: boolean;
  tag?: string;
  durationMin: number;
  eta: string;            // human-readable ETA, e.g. "~20 min"
  sequenceNumber: number; // 1-based ordinal among sibling tasks (F1)
  layer: number;          // nesting depth; 0 = direct child of mother (F1)
  createdAt: string;      // ISO
  parentTodoId: string;   // mother-todo id
}

export interface TaskConfig {
  showDuration: boolean;
}

export const defaultTaskConfig = (): TaskConfig => ({ showDuration: true });
