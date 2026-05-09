import type { ReactElement } from 'react';
import type { ZodSchema } from 'zod';

export interface Node<TState = unknown, TConfig = unknown> {
  id: string;                          // ULID
  kind: string;                        // "pomo", "todo.task", "habit", ...
  position: { x: number; y: number };
  state: TState;                       // serializable JSON — no functions, no DOM
  config: TConfig;                     // user-editable settings
  isMother: boolean;
}

export interface RenderProps<TState, TConfig> {
  node: Node<TState, TConfig>;
  onCommand: (command: string, args?: Record<string, unknown>) => void;
}

export type CommandHandler<TState> = (
  state: TState,
  args: Record<string, unknown>
) => TState;

export interface NodeKind<TState, TConfig> {
  kind: string;
  defaultState: () => TState;
  defaultConfig: () => TConfig;
  render: (props: RenderProps<TState, TConfig>) => ReactElement; // must be pure
  commands: Record<string, CommandHandler<TState>>;
  events: readonly string[];
  schema: ZodSchema<TState>;
}
