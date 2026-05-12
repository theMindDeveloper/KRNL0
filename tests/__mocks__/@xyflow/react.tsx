// Stub for @xyflow/react — used during Vitest runs where the real library
// is not installed in node_modules. Only the shapes used by our code are stubbed.

import React from 'react';

export enum Position {
  Left = 'left',
  Right = 'right',
  Top = 'top',
  Bottom = 'bottom',
}

export interface HandleProps {
  type: 'source' | 'target';
  position: Position;
  id?: string;
  style?: React.CSSProperties;
  className?: string;
}

export function Handle({ type, position, id, style, className }: HandleProps): React.ReactElement {
  return (
    <div
      data-testid={`rf-handle-${type}-${position}`}
      data-handle-type={type}
      data-handle-position={position}
      data-handle-id={id}
      className={className}
      style={style}
      role="presentation"
    />
  );
}

// Minimal stubs for types / other exports used in rfAdapters.tsx
export type Node<TData = Record<string, unknown>> = {
  id: string;
  type?: string;
  position: { x: number; y: number };
  data: TData;
  draggable?: boolean;
  selectable?: boolean;
};

export type Edge = {
  id: string;
  source: string;
  target: string;
  type?: string;
  animated?: boolean;
  data?: Record<string, unknown>;
};

export type NodeProps<TNode extends Node = Node> = {
  id: string;
  type: string;
  data: TNode['data'];
  selected: boolean;
  dragging: boolean;
  zIndex: number;
  isConnectable: boolean;
  positionAbsoluteX: number;
  positionAbsoluteY: number;
};

export function ReactFlow({ children }: { children?: React.ReactNode }): React.ReactElement {
  return <div data-testid="react-flow">{children}</div>;
}

export function Background(): React.ReactElement {
  return <div data-testid="rf-background" />;
}

export function MiniMap(): React.ReactElement {
  return <div data-testid="rf-minimap" />;
}

export function Controls(): React.ReactElement {
  return <div data-testid="rf-controls" />;
}

export function Panel({ children }: { children?: React.ReactNode }): React.ReactElement {
  return <div data-testid="rf-panel">{children}</div>;
}

export function useReactFlow() {
  return {
    fitView: () => undefined,
    setViewport: () => undefined,
    screenToFlowPosition: (pos: { x: number; y: number }) => pos,
    getNodes: () => [],
    getEdges: () => [],
  };
}

export function useNodesState(initial: Node[]) {
  return [initial, () => undefined, () => undefined] as const;
}

export function useEdgesState(initial: Edge[]) {
  return [initial, () => undefined, () => undefined] as const;
}

export interface NodeResizerProps {
  nodeId?: string;
  isVisible?: boolean;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  keepAspectRatio?: boolean;
  color?: string;
  handleStyle?: React.CSSProperties;
  lineStyle?: React.CSSProperties;
  onResizeStart?: (e: unknown, params?: unknown) => void;
  onResize?: (e: unknown, params: { width: number; height: number }) => void;
  onResizeEnd?: (e: unknown, params: { width: number; height: number }) => void;
}

export function NodeResizer(props: NodeResizerProps): React.ReactElement | null {
  return (
    <div
      data-testid="rf-node-resizer"
      data-visible={props.isVisible ? 'true' : 'false'}
      data-min-width={props.minWidth}
      data-min-height={props.minHeight}
      data-max-width={props.maxWidth}
      data-max-height={props.maxHeight}
      data-keep-aspect={props.keepAspectRatio ? 'true' : 'false'}
      onClick={() => {
        // Test hook — fire onResizeEnd with a deterministic size so node
        // commands can be exercised without RF mouse choreography.
        props.onResizeEnd?.(null, { width: 400, height: 200 });
      }}
    />
  );
}
