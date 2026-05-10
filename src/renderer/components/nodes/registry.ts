import { memo, type ComponentType } from 'react';
import { PomoNode } from './PomoNode';
import { TodoNode } from './TodoNode';
import { HabitNode } from './HabitNode';
import { TerminalNode } from './TerminalNode';
import { TaskNode } from './TaskNode';
import { UnknownNode } from './UnknownNode';
import type { NodeProps } from './types';
import { createNodeAdapter } from '../Canvas/rfAdapters';
import type { NodeProps as RFNodeProps } from '@xyflow/react';
import type { KrnlRFNode } from '../Canvas/rfAdapters';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyNodeComponent = ComponentType<NodeProps<any, any>>;

// ── Legacy registry (tests + resolveNodeComponent) ───────────────────────────
// Wrap each node in React.memo at the registry boundary.
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

// ── React Flow node types (CanvasFlow) ───────────────────────────────────────
// Each entry is createNodeAdapter(InnerNode) — the HOC adds RF Handles and
// forwards data.node / data.onCommand / data.onSelect into NodeProps.
// All 7 node kinds registered per Decision #13 §B.
export const NODE_TYPES: Record<string, ComponentType<RFNodeProps<KrnlRFNode>>> = {
  pomo:           createNodeAdapter(PomoNode as AnyNodeComponent),
  todo:           createNodeAdapter(TodoNode as AnyNodeComponent),
  habit:          createNodeAdapter(HabitNode as AnyNodeComponent),
  term:           createNodeAdapter(TerminalNode as AnyNodeComponent),
  'todo.task':    createNodeAdapter(TaskNode as AnyNodeComponent),
  'pomo.session': createNodeAdapter(TaskNode as AnyNodeComponent),
  'habit.day':    createNodeAdapter(TaskNode as AnyNodeComponent),
};
