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
  return {
    id: node.id,
    type: node.kind,
    position: node.position,
    draggable: !node.isMother,
    selectable: true,
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
    // The dasharray "march" via CSS keyframe escaped the node bezels and
    // looked noisy under the cyan glow filter. Keep dashed cyan styling but
    // freeze the animation.
    animated: false,
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
  // (e.g. ImageNode's image-frame) can paint over the handle and hide the
  // connector dot. Lift handles to z-index 10 to keep them in front.
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
    // Mother nodes don't connect — render zero handles
    const showHandles = !node.isMother;
    return (
      <>
        {showHandles && (
          <Handle
            type="target"
            position={Position.Left}
            style={handleStyle}
            isConnectable={!node.isMother}
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
            isConnectable={!node.isMother}
          />
        )}
      </>
    );
  }

  NodeAdapter.displayName = `NodeAdapter(${Inner.displayName ?? Inner.name ?? 'Unknown'})`;
  return React.memo(NodeAdapter) as ComponentType<RFNodeProps<KrnlRFNode>>;
}
