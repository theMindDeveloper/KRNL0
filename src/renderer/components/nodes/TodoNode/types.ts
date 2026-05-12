// Decision #10 — TodoNode state contract.
// Persistence rule: store items in insertion order; sort a copy at render time.

export interface TodoItem {
  id: string;            // crypto.randomUUID()
  text: string;
  done: boolean;
  tag?: string;          // optional 4-char label, e.g. "WORK"
  createdAt: string;     // ISO 8601
  completedAt: string | null; // ISO when done = true, null otherwise
  taskNodeId: string | null;  // Decision 20: back-link to spawned TaskNode.id
}

export interface TodoState {
  items: TodoItem[];     // insertion order; render sorts a copy
}

export interface TodoConfig {
  showCompleted: boolean; // default true
  maxVisible: number;     // default 50
}

export const defaultTodoState = (): TodoState => ({ items: [] });

export const defaultTodoConfig = (): TodoConfig => ({
  showCompleted: true,
  maxVisible: 50,
});
