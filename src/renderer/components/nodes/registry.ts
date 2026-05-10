import type { ComponentType } from 'react';
import { PomoNode } from './PomoNode';
import { TodoNode } from './TodoNode';
import { HabitNode } from './HabitNode';
import { TerminalNode } from './TerminalNode';
import { TaskNode } from './TaskNode';
import { UnknownNode } from './UnknownNode';
import type { NodeProps } from './types';

// Each entry is a component specialized to its own TState/TConfig, so we
// erase the generics at the registry boundary — Canvas hands every component
// a Node<unknown, unknown> and trusts the kernel's schema check upstream.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyNodeComponent = ComponentType<NodeProps<any, any>>;

// Central node-kind dispatch (Decision #8). Adding a new node kind is one
// entry here plus one component file. Cross-node imports remain forbidden;
// the registry is the only module that knows every kind by name.
export const NODE_REGISTRY: Record<string, AnyNodeComponent> = {
  pomo: PomoNode,
  todo: TodoNode,
  habit: HabitNode,
  term: TerminalNode,
  'todo.task': TaskNode,
};

export function resolveNodeComponent(kind: string): AnyNodeComponent {
  return NODE_REGISTRY[kind] ?? UnknownNode;
}
