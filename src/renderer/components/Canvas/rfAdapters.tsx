/**
 * rfAdapters.tsx — thin bridge between boardStore Node/Edge types and
 * React Flow's node/edge shapes.
 *
 * Rules (Decision #13 §B):
 *  - boardStore is the single source of truth.
 *  - Adapter HOC reads data props forwarded by RF; never writes to RF state.
 *  - Handles render inside the adapter wrapper so node bodies stay untouched.
 */

import React from 'react';
import { Handle, Position } from '@xyflow/react';
import type {
  Node as RFNode,
  Edge as RFEdge,
  NodeProps as RFNodeProps,
} from '@xyflow/react';
import type { Node } from '../../../shared/types/node';
import type { Edge } from '../../../shared/types/edge';
import type { NodeProps } from '../nodes/types';
import type { ComponentType } from 'react';

// ── RFNodeData — the shape stored in RF's node.data ───────────────────────────
// Extends Record<string,unknown> as required by RF's Node<Data> constraint.
export interface RFNodeData extends Record<string, unknown> {
  node: Node;
  onCommand: (command: string, args?: Record<string, unknown>) => void;
  onSelect: () => void;
  slotIndex?: number | undefined;
  slotTotal?: number | undefined;
  onMoveLeft?: ((() => void) | undefined);
  onMoveRight?: ((() => void) | undefined);
}

// Convenience alias for the full RF node type with our data.
export type KrnlRFNode = RFNode<RFNodeData>;

// ── toRfNode ──────────────────────────────────────────────────────────────────

// Pre-seeded width/height so RF doesn't fire warning #015 ("trying to drag a
// node that is not initialized") when a freshly-added node is dragged before
// the ResizeObserver has fired its first measurement. These are approximate
// — RF replaces them with measured values once the ResizeObserver delivers.
const INITIAL_DIMS_BY_KIND: Record<string, { width: number; height: number }> = {
  'todo.task':   { width: 220, height: 120 },
  'todo':        { width: 380, height: 600 },
  'pomo':        { width: 380, height: 600 },
  'ai':          { width: 380, height: 600 },
  'habit':       { width: 380, height: 600 },
  'terminal':    { width: 380, height: 600 },
  'habit.lane':  { width: 280, height: 140 },
  'text':        { width: 240, height: 120 },
  'image':       { width: 240, height: 200 },
};

export function toRfNode(
  node: Node,
  ctx: {
    onCommand: (command: string, args?: Record<string, unknown>) => void;
    onSelect: () => void;
    slotIndex?: number | undefined;
    slotTotal?: number | undefined;
    onMoveLeft?: ((() => void) | undefined);
    onMoveRight?: ((() => void) | undefined);
  }
): KrnlRFNode {
  // Decision 22.2 Fix 5 — add a CSS class keyed on node.kind so the todo-family
  // selection ring can be scoped in reactflow-theme.css without inline style overrides.
  // node.kind may contain "." (e.g. "todo.task") — replace with "--" for a valid class name.
  const kindClass = `krnl-kind-${node.kind.replace('.', '--')}`;
  const initialDims = INITIAL_DIMS_BY_KIND[node.kind];
  return {
    id: node.id,
    type: node.kind,
    position: node.position,
    draggable: !node.isMother,
    selectable: true,
    className: kindClass,
    ...(initialDims !== undefined
      ? {
          width: initialDims.width,
          height: initialDims.height,
          measured: { width: initialDims.width, height: initialDims.height },
        }
      : {}),
    data: {
      node,
      onCommand: ctx.onCommand,
      onSelect: ctx.onSelect,
      slotIndex: ctx.slotIndex,
      slotTotal: ctx.slotTotal,
      onMoveLeft: ctx.onMoveLeft,
      onMoveRight: ctx.onMoveRight,
    },
  };
}

// ── toRfEdge ──────────────────────────────────────────────────────────────────

export function toRfEdge(
  edge: Edge,
  srcKind: string,
  tgtKind: string
): RFEdge {
  const isTaskFlow = srcKind === 'todo.task' && tgtKind === 'todo.task';
  return {
    id: edge.id,
    source: edge.from.nodeId,
    target: edge.to.nodeId,
    type: isTaskFlow ? 'task-flow' : 'default',
    // Decision 22.2 Fix 6 — re-enable the dash march for task-flow edges.
    // The keyframe in reactflow-theme.css is period-matched (22 units) so the
    // loop is seamless. Default-typed edges remain static.
    animated: isTaskFlow,
    data: { edge },
  };
}

// ── createNodeAdapter ─────────────────────────────────────────────────────────

const handleStyle: React.CSSProperties = {
  width: 12,
  height: 12,
  background: 'var(--paper)',
  border: '1.5px solid var(--ink-3)',
  opacity: 0.7,
  // RF positions Handles at the absolute left/right edge of the node. Without
  // an explicit z-index, nodes whose body has `position: relative` content
  // (e.g. ImageNode's image-frame) create a new stacking context and bury
  // default-z handles. Lift to z-index 10 to keep connector dots in front.
  zIndex: 10,
};

/**
 * HOC that adapts a KRNL NodeProps component to a React Flow node component.
 * Adds source/target Handles on left/right so node bodies are not touched.
 * Memoised for RF's identity comparison.
 */
export function createNodeAdapter<S = unknown, C = unknown>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Inner: ComponentType<NodeProps<S, C>>
): ComponentType<RFNodeProps<KrnlRFNode>> {
  function NodeAdapter(props: RFNodeProps<KrnlRFNode>) {
    const { data, selected } = props;
    const { node, onCommand, onSelect, slotIndex, slotTotal, onMoveLeft, onMoveRight } = data;
    // Mother nodes don't connect — render zero handles. Children get
    // interactive handles so users can wire edges between them.
    const showHandles = !node.isMother;
    return (
      <>
        {showHandles && (
          <Handle
            type="target"
            position={Position.Left}
            style={handleStyle}
            isConnectable={true}
          />
        )}
        <Inner
          node={node as Node<S, C>}
          selected={selected === true}
          onCommand={onCommand}
          onSelect={onSelect}
          slotIndex={slotIndex as number | undefined}
          slotTotal={slotTotal as number | undefined}
          onMoveLeft={onMoveLeft as (() => void) | undefined}
          onMoveRight={onMoveRight as (() => void) | undefined}
        />
        {showHandles && (
          <Handle
            type="source"
            position={Position.Right}
            style={handleStyle}
            isConnectable={true}
          />
        )}
      </>
    );
  }

  NodeAdapter.displayName = `NodeAdapter(${Inner.displayName ?? Inner.name ?? 'Unknown'})`;
  return React.memo(NodeAdapter) as ComponentType<RFNodeProps<KrnlRFNode>>;
}
