import { memo, type ComponentType } from 'react';
import { PomoNode } from './PomoNode';
import { TodoNode } from './TodoNode';
import { HabitNode } from './HabitNode';
import { TerminalNode } from './TerminalNode';
import { TaskNode } from './TaskNode';
import { UnknownNode } from './UnknownNode';
import type { NodeProps } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyNodeComponent = ComponentType<NodeProps<any, any>>;

// Wrap each node in React.memo at the registry boundary. With Canvas using
// per-id store subscription, this prevents unrelated store updates from
// re-rendering all node bodies (the prior perf bug).
const NODE_REGISTRY_RAW: Record<string, AnyNodeComponent> = {
  pomo: PomoNode as AnyNodeComponent,
  todo: TodoNode as AnyNodeComponent,
  habit: HabitNode as AnyNodeComponent,
  term: TerminalNode as AnyNodeComponent,
  'todo.task': TaskNode as AnyNodeComponent,
};
export const NODE_REGISTRY: Record<string, AnyNodeComponent> = Object.fromEntries(
  Object.entries(NODE_REGISTRY_RAW).map(([k, C]) => [k, memo(C)])
);

export function resolveNodeComponent(kind: string): AnyNodeComponent {
  return NODE_REGISTRY[kind] ?? UnknownNode;
}
