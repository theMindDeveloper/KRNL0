/**
 * Stub for @xyflow/react — used in Node/jsdom test environments where the
 * real ESM-only package cannot be resolved against the worktree's node_modules.
 *
 * Provides the minimal surface used by the renderer components under test:
 * useReactFlow, ReactFlowProvider, Panel, ReactFlow, Background,
 * BackgroundVariant, Controls, MiniMap, BaseEdge, getBezierPath.
 */

import React from 'react';
import { vi } from 'vitest';

export const useReactFlow = vi.fn(() => ({
  fitView: vi.fn(),
  getViewport: vi.fn(() => ({ x: 0, y: 0, zoom: 1 })),
}));

export const ReactFlowProvider = ({ children }: { children: React.ReactNode }) =>
  React.createElement(React.Fragment, null, children);

export const Panel = ({ children }: { children: React.ReactNode }) =>
  React.createElement('div', { 'data-testid': 'rf-panel' }, children);

export const ReactFlow = ({ children }: { children?: React.ReactNode }) =>
  React.createElement('div', { 'data-testid': 'react-flow' }, children);

export const Background = () => React.createElement('div', { 'data-testid': 'rf-background' });

export const BackgroundVariant = { Dots: 'dots', Lines: 'lines', Cross: 'cross' } as const;

export const Controls = () => React.createElement('div', { 'data-testid': 'rf-controls' });

export const MiniMap = () => React.createElement('div', { 'data-testid': 'rf-minimap' });

export const BaseEdge = () => null;

export function getBezierPath() {
  return ['M 0 0', null, null, null] as [string, number | undefined, number | undefined, number | undefined];
}
