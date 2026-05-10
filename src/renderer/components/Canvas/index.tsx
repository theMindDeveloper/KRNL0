import { useCallback, useEffect, useMemo, useRef, useState, memo } from 'react';
import { useBoardStore } from '../../store/boardStore';
import { useViewportPersistence } from '../../store/useViewportPersistence';
import { resolveNodeComponent } from '../nodes/registry';
import { makeCommandHandler } from './commandDispatch';
import type { NodeKind } from '../../../shared/types/node';
import type { Node, Edge } from '../../../shared/types';
import { shallow } from 'zustand/shallow';

const PAN_BUTTON_MIDDLE = 1;
const PAN_BUTTON_LEFT = 0;
const ZOOM_SENSITIVITY = 0.001;

const GRID_STYLE: React.CSSProperties = {
  backgroundImage: `
    radial-gradient(circle, var(--grid-strong) 1.5px, transparent 1.5px),
    radial-gradient(circle, var(--grid) 1px, transparent 1px)
  `,
  backgroundSize: `var(--grid-major) var(--grid-major), var(--grid-minor) var(--grid-minor)`,
};

// Approximate dimensions per node kind for edge port positioning.
const NODE_WIDTHS: Record<NodeKind, number> = {
  pomo: 380, todo: 380, habit: 380, term: 380,
  'pomo.session': 200, 'todo.task': 220, 'habit.day': 240,
};
const NODE_HEIGHTS: Record<NodeKind, number> = {
  pomo: 460, todo: 360, habit: 360, term: 360,
  'pomo.session': 120, 'todo.task': 90, 'habit.day': 60,
};
const getNodeWidth = (kind: string): number =>
  (NODE_WIDTHS as Record<string, number>)[kind] ?? 240;
const getNodeHeight = (kind: string): number =>
  (NODE_HEIGHTS as Record<string, number>)[kind] ?? 240;

// ── Drag state — module-level ref so pointermove handlers don't re-render ────
interface DragState {
  nodeId: string;
  pointerId: number;
  startPointer: { x: number; y: number };
  startNodePos: { x: number; y: number };
  pendingDelta: { dx: number; dy: number };
  rafId: number | null;
}
const dragStateRef: { current: DragState | null } = { current: null };

// ─── TransformLayer — only this component re-renders on pan/zoom ─────────────
const TransformLayer = memo(function TransformLayer({ children }: { children: React.ReactNode }) {
  const viewport = useBoardStore((s) => s.viewport);
  return (
    <div
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
        transformOrigin: '0 0',
        willChange: 'transform',
      }}
    >
      {children}
    </div>
  );
});

// ─── EdgeLayer — subscribes to nodes + edges only ────────────────────────────
const EdgeLayer = memo(function EdgeLayer() {
  const nodes = useBoardStore((s) => s.board?.nodes ?? []);
  const edges = useBoardStore((s) => s.board?.edges ?? []);
  return (
    <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}>
      <defs>
        <filter id="acid-glow">
          <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#c9f158" floodOpacity="0.7" />
        </filter>
      </defs>
      {edges.map((edge) => {
        const src = nodes.find((n) => n.id === edge.from.nodeId);
        const tgt = nodes.find((n) => n.id === edge.to.nodeId);
        if (!src || !tgt) return null;
        const sx = src.position.x + getNodeWidth(src.kind);
        const sy = src.position.y + getNodeHeight(src.kind) / 2;
        const tx = tgt.position.x;
        const ty = tgt.position.y + getNodeHeight(tgt.kind) / 2;
        const d = `M ${sx} ${sy} C ${sx + 80} ${sy} ${tx - 80} ${ty} ${tx} ${ty}`;
        const isTaskFlow = src.kind === 'todo.task' && tgt.kind === 'todo.task';
        if (isTaskFlow) {
          return (
            <path key={edge.id} d={d} fill="none" stroke="var(--cyan)" strokeWidth={2}
              strokeDasharray="14 8" opacity={0.95} className="task-flow-edge" />
          );
        }
        return (
          <path key={edge.id} d={d} fill="none"
            stroke={edge.enabled ? 'var(--acid)' : 'var(--ink-3)'}
            strokeWidth={edge.enabled ? 1.5 : 1}
            strokeDasharray={edge.enabled ? undefined : '4 3'}
            opacity={edge.enabled ? 1 : 0.6}
            filter={edge.enabled ? 'url(#acid-glow)' : undefined} />
        );
      })}
    </svg>
  );
});

// ─── NodeRenderer — subscribes to ONE node by id ─────────────────────────────
interface NodeRendererProps {
  nodeId: string;
  onDragStart: (e: React.PointerEvent<HTMLDivElement>, node: Node) => void;
  onDragMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onDragEnd: (e: React.PointerEvent<HTMLDivElement>) => void;
}
const NodeRenderer = memo(function NodeRenderer({
  nodeId, onDragStart, onDragMove, onDragEnd,
}: NodeRendererProps) {
  // Per-id selectors — only re-renders when THIS node or its selection changes
  const node = useBoardStore(
    useCallback((s) => s.board?.nodes.find((n) => n.id === nodeId), [nodeId])
  );
  const isSelected = useBoardStore((s) => s.selectedNodeId === nodeId);
  const selectNode = useBoardStore((s) => s.selectNode);

  // Stable command handler per node id
  const onCommand = useMemo(() => makeCommandHandler(nodeId), [nodeId]);

  if (!node) return null;
  const Component = resolveNodeComponent(node.kind);
  const isMother = node.isMother;

  return (
    <div
      onPointerDown={(e) => onDragStart(e, node)}
      onPointerMove={onDragMove}
      onPointerUp={onDragEnd}
      onPointerCancel={onDragEnd}
      onClick={(e) => { e.stopPropagation(); selectNode(node.id); }}
      style={{
        position: 'absolute',
        left: node.position.x,
        top: node.position.y,
        outline: isSelected ? '1px solid var(--acid)' : undefined,
        boxShadow: isSelected ? 'var(--shadow-glow)' : undefined,
        cursor: isMother ? 'default' : 'grab',
      }}
    >
      <Component node={node} selected={isSelected} onCommand={onCommand}
        onSelect={() => selectNode(node.id)} />
    </div>
  );
});

// ─── NodeList — subscribes only to id list (shallow) ─────────────────────────
interface NodeListProps {
  onDragStart: (e: React.PointerEvent<HTMLDivElement>, node: Node) => void;
  onDragMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onDragEnd: (e: React.PointerEvent<HTMLDivElement>) => void;
}
const NodeList = memo(function NodeList({ onDragStart, onDragMove, onDragEnd }: NodeListProps) {
  const ids = useBoardStore(
    (s) => (s.board?.nodes ?? []).map((n) => n.id),
    shallow
  );
  return (
    <>
      {ids.map((id) => (
        <NodeRenderer key={id} nodeId={id}
          onDragStart={onDragStart} onDragMove={onDragMove} onDragEnd={onDragEnd} />
      ))}
    </>
  );
});

// ─── Canvas root — handles pan/zoom + global keys + drag callbacks ───────────
export function Canvas() {
  const panBy = useBoardStore((s) => s.panBy);
  const zoomAt = useBoardStore((s) => s.zoomAt);
  const resetViewport = useBoardStore((s) => s.resetViewport);
  const updateNode = useBoardStore((s) => s.updateNode);
  const selectNode = useBoardStore((s) => s.selectNode);

  const containerRef = useRef<HTMLDivElement>(null);
  const panState = useRef<{ pointerId: number } | null>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [grabbing, setGrabbing] = useState(false);

  useViewportPersistence();

  // Global keys — gated on typing target
  useEffect(() => {
    const isTypingTarget = (t: EventTarget | null): boolean => {
      if (!(t instanceof HTMLElement)) return false;
      const tag = t.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || t.isContentEditable;
    };
    const onDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.code === 'Space' && !e.repeat) setSpaceHeld(true);
      if (e.code === 'Home') resetViewport();
      if (e.code === 'Escape') selectNode(null);
    };
    const onUp = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.code === 'Space') setSpaceHeld(false);
    };
    document.body.addEventListener('keydown', onDown);
    document.body.addEventListener('keyup', onUp);
    return () => {
      document.body.removeEventListener('keydown', onDown);
      document.body.removeEventListener('keyup', onUp);
    };
  }, [resetViewport, selectNode]);

  // ── Canvas pan ────────────────────────────────────────────────────────────
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const isMiddle = e.button === PAN_BUTTON_MIDDLE;
    const isSpaceLeft = e.button === PAN_BUTTON_LEFT && spaceHeld;
    if (!isMiddle && !isSpaceLeft) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    panState.current = { pointerId: e.pointerId };
    setGrabbing(true);
    e.preventDefault();
  }, [spaceHeld]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!panState.current || panState.current.pointerId !== e.pointerId) return;
    panBy(e.movementX, e.movementY);
  }, [panBy]);

  const endPan = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!panState.current || panState.current.pointerId !== e.pointerId) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    panState.current = null;
    setGrabbing(false);
  }, []);

  const onWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const localX = e.clientX - rect.left - rect.width / 2;
    const localY = e.clientY - rect.top - rect.height / 2;
    const factor = Math.exp(-e.deltaY * ZOOM_SENSITIVITY);
    zoomAt(localX, localY, factor);
  }, [zoomAt]);

  // ── Node drag — rAF-batched ──────────────────────────────────────────────
  const onDragStart = useCallback((e: React.PointerEvent<HTMLDivElement>, node: Node) => {
    if (node.isMother) return;
    if (e.button !== PAN_BUTTON_LEFT) return;
    if (spaceHeld) return;
    e.stopPropagation();
    selectNode(node.id);
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStateRef.current = {
      nodeId: node.id,
      pointerId: e.pointerId,
      startPointer: { x: e.clientX, y: e.clientY },
      startNodePos: { x: node.position.x, y: node.position.y },
      pendingDelta: { dx: 0, dy: 0 },
      rafId: null,
    };
  }, [spaceHeld, selectNode]);

  const onDragMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const ds = dragStateRef.current;
    if (!ds || ds.pointerId !== e.pointerId) return;
    const zoom = useBoardStore.getState().viewport.zoom;
    ds.pendingDelta.dx = (e.clientX - ds.startPointer.x) / zoom;
    ds.pendingDelta.dy = (e.clientY - ds.startPointer.y) / zoom;
    if (ds.rafId !== null) return;
    ds.rafId = requestAnimationFrame(() => {
      const cur = dragStateRef.current;
      if (!cur) return;
      cur.rafId = null;
      updateNode(cur.nodeId, {
        position: {
          x: cur.startNodePos.x + cur.pendingDelta.dx,
          y: cur.startNodePos.y + cur.pendingDelta.dy,
        },
      });
    });
  }, [updateNode]);

  const onDragEnd = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const ds = dragStateRef.current;
    if (!ds || ds.pointerId !== e.pointerId) return;
    if (ds.rafId !== null) cancelAnimationFrame(ds.rafId);
    e.currentTarget.releasePointerCapture(e.pointerId);
    dragStateRef.current = null;
    const board = useBoardStore.getState().board;
    if (board) void window.krnl?.boardSave(board);
  }, []);

  const cursor = grabbing ? 'grabbing' : spaceHeld ? 'grab' : 'default';

  return (
    <div
      ref={containerRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPan}
      onPointerCancel={endPan}
      onWheel={onWheel}
      onClick={() => selectNode(null)}
      style={{
        width: '100%',
        height: '100%',
        background: 'var(--paper)',
        position: 'relative',
        overflow: 'hidden',
        cursor,
        touchAction: 'none',
        ...GRID_STYLE,
      }}
    >
      <TransformLayer>
        <EdgeLayer />
        <NodeList onDragStart={onDragStart} onDragMove={onDragMove} onDragEnd={onDragEnd} />
      </TransformLayer>
    </div>
  );
}
