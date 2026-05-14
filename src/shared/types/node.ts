import type { ReactElement } from 'react';
import type { ZodSchema } from 'zod';

export interface Node<TState = unknown, TConfig = unknown> {
  id: string;                          // ULID
  kind: string;                        // "pomo", "todo.task", "habit", ...
  position: { x: number; y: number };
  state: TState;                       // serializable JSON — no functions, no DOM
  config: TConfig;                     // user-editable settings
  isMother: boolean;
  slot?: number;                       // optional ordering slot for mother nodes
}

export interface RenderProps<TState, TConfig> {
  node: Node<TState, TConfig>;
  onCommand: (command: string, args?: Record<string, unknown>) => void;
}

export type CommandHandler<TState> = (
  state: TState,
  args: Record<string, unknown>
) => TState;

// Built-in node kind identifiers (Decision #8). Mother kinds + child kinds.
// Renderer dispatch uses the literal value; storage on `Node.kind` is kept as
// `string` so unknown kinds round-trip through board.json without crashing.
export type NodeKind =
  | 'pomo'
  | 'todo'
  | 'habit'
  | 'term'
  | 'calendar'
  | 'pomo.session'
  | 'todo.task'
  | 'habit.day'
  | 'text'
  | 'image'
  | 'clock';

// Spec a node-kind module exports to the kernel (commands, events, schema).
// Renamed from `NodeKind` to avoid shadowing the literal union above.
export interface NodeKindSpec<TState, TConfig> {
  kind: NodeKind;
  defaultState: () => TState;
  defaultConfig: () => TConfig;
  render: (props: RenderProps<TState, TConfig>) => ReactElement;
  commands: Record<string, CommandHandler<TState>>;
  events: readonly string[];
  schema: ZodSchema<TState>;
}
