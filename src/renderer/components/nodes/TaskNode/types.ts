export interface TaskState {
  text: string;
  done: boolean;
  tag?: string;
  durationMin: number;
  createdAt: string;      // ISO
  parentTodoId: string;   // mother-todo id
}

export interface TaskConfig {
  showDuration: boolean;
}

export const defaultTaskConfig = (): TaskConfig => ({ showDuration: true });
