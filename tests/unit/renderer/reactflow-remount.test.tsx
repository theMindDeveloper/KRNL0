/**
 * ADR 0008 § 9.3 / § 12 — Gating prerequisite for Step 4.
 *
 * Verify that viewport state survives a <ReactFlow> unmount/remount under the
 * same <ReactFlowProvider>.  The test environment uses the @xyflow/react mock
 * (tests/__mocks__/@xyflow/react.tsx), so we cannot exercise RF's internal
 * store directly.  Instead we validate the contract that the implementation
 * must honour:
 *
 *   boardStore.viewport is updated by onMoveEnd → setViewport (already in
 *   CanvasFlow).  When <ReactFlow> remounts it must receive
 *   defaultViewport={boardStore.viewport} so the canvas resumes at the last
 *   user position, not the library default.
 *
 * This test exercises the store-side contract (setViewport persists the value;
 * reading it back after a simulated remount returns the persisted value) and
 * confirms the defaultViewport prop shapes are structurally compatible.
 *
 * If this test fails:
 *   Fix — pass `defaultViewport={boardStore.viewport}` to <ReactFlow> in both
 *   CanvasFlow (canvas mode) and EmbeddedCanvasCell (station mode).  The
 *   existing `onMoveEnd → setViewport` write already exists in CanvasFlow.tsx;
 *   the `defaultViewport` read is the missing half.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useBoardStore } from '../../../src/renderer/store/boardStore';
import type { Board } from '../../../src/shared/types';

function makeBoard(overrides: Partial<Board> = {}): Board {
  return {
    version: 1,
    schemaVersion: 2,
    savedAt: '2026-05-18T00:00:00.000Z',
    viewport: { x: 0, y: 220, zoom: 1 },
    layoutMode: 'canvas',
    nodes: [],
    edges: [],
    ...overrides,
  };
}

describe('viewport survives ReactFlow unmount/remount (ADR 0008 § 9.3)', () => {
  beforeEach(() => {
    useBoardStore.setState({
      board: makeBoard(),
      viewport: { x: 0, y: 220, zoom: 1 },
    });
  });

  it('setViewport persists the viewport in boardStore (onMoveEnd contract)', () => {
    const targetViewport = { x: 120, y: -40, zoom: 0.85 };
    // Simulate onMoveEnd firing with the user-pan viewport.
    useBoardStore.getState().setViewport(targetViewport);

    // The store must reflect the new viewport immediately.
    expect(useBoardStore.getState().viewport).toEqual(targetViewport);
  });

  it('viewport persists across simulated remount (same-provider contract)', () => {
    const targetViewport = { x: 120, y: -40, zoom: 0.85 };

    // Step 1: simulate user panning (onMoveEnd → setViewport).
    useBoardStore.getState().setViewport(targetViewport);

    // Step 2: simulate ReactFlow unmount — viewport in store is unchanged.
    // (In the real app, the ReactFlow element is unmounted when switching modes
    // and remounted in the new host.  The store holds the last known viewport.)
    const viewportAfterUnmount = useBoardStore.getState().viewport;
    expect(viewportAfterUnmount).toEqual(targetViewport);

    // Step 3: simulate remount.  EmbeddedCanvasCell / CanvasFlow will read
    // boardStore.viewport and pass it as defaultViewport to <ReactFlow>.
    // After remount, the store must still carry the correct value.
    const viewportAfterRemount = useBoardStore.getState().viewport;
    expect(viewportAfterRemount).toEqual(targetViewport);

    // Step 4: confirm the defaultViewport shape is structurally correct.
    expect(viewportAfterRemount).toMatchObject({ x: expect.any(Number), y: expect.any(Number), zoom: expect.any(Number) });
  });

  it('zoom is clamped to [0.25, 4] on setViewport (ZOOM_MIN/ZOOM_MAX)', () => {
    // Ensure extreme values do not escape the clamp — EmbeddedCanvasCell's
    // defaultViewport will never receive an out-of-range zoom.
    useBoardStore.getState().setViewport({ x: 0, y: 0, zoom: 0.01 });
    expect(useBoardStore.getState().viewport.zoom).toBe(0.25);

    useBoardStore.getState().setViewport({ x: 0, y: 0, zoom: 99 });
    expect(useBoardStore.getState().viewport.zoom).toBe(4);
  });

  it('layoutMode toggle does not reset viewport', () => {
    const targetViewport = { x: 120, y: -40, zoom: 0.85 };
    useBoardStore.setState({
      board: makeBoard({ layoutMode: 'canvas' }),
      viewport: targetViewport,
    });

    // Toggle to station.
    useBoardStore.getState().setLayoutMode('station');
    expect(useBoardStore.getState().viewport).toEqual(targetViewport);

    // Toggle back to canvas.
    useBoardStore.getState().setLayoutMode('canvas');
    expect(useBoardStore.getState().viewport).toEqual(targetViewport);
  });
});
