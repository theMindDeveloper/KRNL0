// Shared dispatch — types only. No React, no Zustand, no IPC.

import type { TaskState } from '../../renderer/components/nodes/TaskNode/types';
import type { TodoState } from '../../renderer/components/nodes/TodoNode/types';
import type { PomoState } from '../../renderer/components/nodes/PomoNode/types';

export type { TaskState, TodoState, PomoState };

// Minimal board shape shared between main and renderer dispatch.
// Main uses AnyNode[]  (no typed generics) — we accept either via loose shape.

export interface AnyNode {
  id: string;
  kind: string;
  isMother?: boolean;
  state: unknown;
  position?: { x: number; y: number };
  config?: unknown;
  [k: string]: unknown;
}

export interface AnyEdge {
  id: string;
  from: { nodeId: string; event: string };
  to: { nodeId: string; command: string };
  enabled: boolean;
}

export interface BoardShape {
  nodes: AnyNode[];
  edges: AnyEdge[];
  [k: string]: unknown;
}

/** Injected side-effect generators so the pure functions are testable. */
export interface DispatchCtx {
  uuid: () => string;
  now: () => string; // ISO string
}
