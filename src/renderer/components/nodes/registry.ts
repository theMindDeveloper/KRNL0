import type { ComponentType } from 'react';
import { PomoNode } from './PomoNode';
import { TodoNode } from './TodoNode';
import { HabitNode } from './HabitNode';
import { TerminalNode } from './TerminalNode';
import { UnknownNode } from './UnknownNode';
import type { NodeProps } from './types';

// Central node-kind dispatch (Decision #8). Adding a new node kind is one
// entry here plus one component file. Cross-node imports remain forbidden;
// the registry is the only module that knows every kind by name.
export const NODE_REGISTRY: Record<string, ComponentType<NodeProps>> = {
  pomo: PomoNode,
  todo: TodoNode,
  habit: HabitNode,
  term: TerminalNode,
};

export function resolveNodeComponent(kind: string): ComponentType<NodeProps> {
  return NODE_REGISTRY[kind] ?? UnknownNode;
}
