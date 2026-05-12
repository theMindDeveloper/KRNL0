// @vitest-environment jsdom
/**
 * PomoNode addendum tests — Decision 9 Addendum (2026-05-12).
 *
 * Covers the new requirements F9–F14 in docs/06-requirements/pomo-node.md
 * (gear settings, FSM-guarded inputs, prominent counter). F11 (long-break
 * branching) is exercised by PomoNode.commands.test.ts. F13 (mother mirrors
 * active task) requires the boardStore + commandDispatch wiring; covered by
 * the existing TaskNode tests for state shape and the integration test plan
 * in the requirements doc.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';

import { PomoNode } from '../../../src/renderer/components/nodes/PomoNode';
import { defaultPomoState, defaultPomoConfig } from '../../../src/renderer/components/nodes/PomoNode/types';
import { useBoardStore } from '../../../src/renderer/store/boardStore';
import type { Board } from '../../../src/shared/types';

afterEach(() => cleanup());

function mountMother(opts: {
  status?: 'idle' | 'running' | 'break';
  sessionsCompleted?: number;
  config?: Partial<ReturnType<typeof defaultPomoConfig>>;
  onCommand?: (cmd: string, args?: Record<string, unknown>) => void;
} = {}) {
  const state = {
    ...defaultPomoState(),
    status: opts.status ?? 'idle',
    sessionsCompleted: opts.sessionsCompleted ?? 0,
  };
  const config = { ...defaultPomoConfig(), ...(opts.config ?? {}) };
  const motherNode = {
    id: 'mother-pomo',
    kind: 'pomo' as const,
    position: { x: 0, y: 0 },
    isMother: true,
    state,
    config,
  };
  // Seed board so the F13 active-task lookup has somewhere to read from.
  const board: Board = {
    version: 1,
    schemaVersion: 1,
    savedAt: new Date().toISOString(),
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [motherNode] as never,
    edges: [],
  };
  useBoardStore.getState().setBoard(board);
  return render(
    React.createElement(PomoNode, {
      node: motherNode as never,
      selected: false,
      onCommand: opts.onCommand ?? vi.fn(),
      onSelect: vi.fn(),
    } as never),
  );
}

describe('Decision 9 Addendum — gear settings, prominent counter', () => {
  it('F9 — gear button is rendered and toggles the settings panel', () => {
    const { getByTestId, queryByTestId } = mountMother();
    expect(queryByTestId('pomo-settings-panel')).toBeNull();
    const gear = getByTestId('pomo-gear');
    fireEvent.click(gear);
    expect(queryByTestId('pomo-settings-panel')).not.toBeNull();
    fireEvent.click(gear);
    expect(queryByTestId('pomo-settings-panel')).toBeNull();
  });

  it('F9 — settings inputs are pre-filled from current config', () => {
    const { getByTestId } = mountMother({
      config: { defaultDurationMin: 50, defaultBreakMin: 10, longBreakMin: 30, longBreakEvery: 6 },
    });
    fireEvent.click(getByTestId('pomo-gear'));
    expect((getByTestId('pomo-setting-session') as HTMLInputElement).value).toBe('50');
    expect((getByTestId('pomo-setting-break') as HTMLInputElement).value).toBe('10');
    expect((getByTestId('pomo-setting-longBreak') as HTMLInputElement).value).toBe('30');
    expect((getByTestId('pomo-setting-longBreakEvery') as HTMLInputElement).value).toBe('6');
  });

  it('F9 — entering a value and pressing Enter dispatches the matching command', () => {
    const onCommand = vi.fn();
    const { getByTestId } = mountMother({ onCommand });
    fireEvent.click(getByTestId('pomo-gear'));
    const input = getByTestId('pomo-setting-break') as HTMLInputElement;
    input.value = '7';
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommand).toHaveBeenCalledWith('pomo.setBreak', { minutes: 7 });
  });

  it('F10 — inputs are disabled while status is running', () => {
    const { getByTestId } = mountMother({ status: 'running' });
    fireEvent.click(getByTestId('pomo-gear'));
    const input = getByTestId('pomo-setting-session') as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });

  it('F12 — session counter is rendered with the unbounded sessionsCompleted', () => {
    const { getByTestId } = mountMother({ sessionsCompleted: 17 });
    const counter = getByTestId('pomo-session-counter');
    expect(counter.textContent).toContain('17');
  });
});
