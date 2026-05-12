// HabitLaneNode — schema + dispatch routing smoke tests.
// The lane component reads from the board store and is integration-tested
// in the running app; these tests cover the pure schema + the routing
// helpers that bridge lane commands to mother-habit mutations.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  defaultHabitLaneConfig,
  defaultHabitLaneState,
} from '../../../src/renderer/components/nodes/HabitLaneNode/types';
import { useBoardStore } from '../../../src/renderer/store/boardStore';
import { makeCommandHandler } from '../../../src/renderer/components/Canvas/commandDispatch';
import {
  habitAdd,
  type HabitEnv,
} from '../../../src/renderer/components/nodes/HabitNode/commands';
import { defaultHabitConfig, defaultHabitState } from '../../../src/renderer/components/nodes/HabitNode/types';
import type { Board } from '../../../src/shared/types';
import type { Node } from '../../../src/shared/types/node';

const env: HabitEnv = {
  uuid: () => 'h-test',
  now: () => '2026-05-12T10:00:00.000Z',
  today: () => '2026-05-12',
};

function seedBoardWithHabit(): Board {
  const motherState = habitAdd(defaultHabitState(), { name: 'meditate' }, env);
  const habitId = motherState.habits[0]!.id;
  const mother: Node = {
    id: 'mother-habit',
    kind: 'habit',
    position: { x: 0, y: 0 },
    isMother: true,
    state: motherState,
    config: defaultHabitConfig(),
  };
  void habitId;
  return {
    version: 1,
    schemaVersion: 1,
    savedAt: '2026-05-12T10:00:00.000Z',
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [mother],
    edges: [],
  };
}

beforeEach(() => {
  useBoardStore.setState({ board: null });
  // Suppress window.krnl persist
  (globalThis as { window?: unknown }).window = {
    krnl: { boardSave: () => Promise.resolve() },
  };
});

describe('HabitLaneNode — defaults', () => {
  it('default state has empty habitId', () => {
    expect(defaultHabitLaneState().habitId).toBe('');
  });

  it('default state accepts an id', () => {
    expect(defaultHabitLaneState('abc').habitId).toBe('abc');
  });

  it('default config has days = 28', () => {
    expect(defaultHabitLaneConfig().days).toBe(28);
  });
});

describe('habit.spawnLane via dispatch', () => {
  it('spawns a habit.lane child node pointing to the requested habit', () => {
    const board = seedBoardWithHabit();
    useBoardStore.setState({ board });
    const habitId = (board.nodes[0]!.state as { habits: Array<{ id: string }> }).habits[0]!.id;

    const handler = makeCommandHandler('mother-habit');
    handler('habit.spawnLane', { habitId });

    const next = useBoardStore.getState().board!;
    const lane = next.nodes.find((n) => n.kind === 'habit.lane');
    expect(lane).toBeDefined();
    expect((lane!.state as { habitId: string }).habitId).toBe(habitId);
  });

  it('does not spawn a second lane for the same habit', () => {
    const board = seedBoardWithHabit();
    useBoardStore.setState({ board });
    const habitId = (board.nodes[0]!.state as { habits: Array<{ id: string }> }).habits[0]!.id;

    const handler = makeCommandHandler('mother-habit');
    handler('habit.spawnLane', { habitId });
    handler('habit.spawnLane', { habitId });

    const lanes = useBoardStore
      .getState()
      .board!.nodes.filter((n) => n.kind === 'habit.lane');
    expect(lanes).toHaveLength(1);
  });
});

describe('habit.lane.toggleToday routes to mother', () => {
  it('adds today to the mother habit log', () => {
    const board = seedBoardWithHabit();
    useBoardStore.setState({ board });
    const habitId = (board.nodes[0]!.state as { habits: Array<{ id: string }> }).habits[0]!.id;

    // Spawn lane
    const spawn = makeCommandHandler('mother-habit');
    spawn('habit.spawnLane', { habitId });

    const lane = useBoardStore
      .getState()
      .board!.nodes.find((n) => n.kind === 'habit.lane')!;
    const laneHandler = makeCommandHandler(lane.id);
    laneHandler('habit.lane.toggleToday');

    const mother = useBoardStore
      .getState()
      .board!.nodes.find((n) => n.kind === 'habit' && n.isMother)!;
    const habit = (mother.state as { habits: Array<{ id: string; log: string[] }> }).habits[0]!;
    expect(habit.log.length).toBeGreaterThan(0);
  });
});

describe('habit.markDone edge routes to lane.habitId', () => {
  it('marks today done on the lane\'s habit when an edge fires habit.markDone', () => {
    const board = seedBoardWithHabit();
    useBoardStore.setState({ board });
    const habitId = (board.nodes[0]!.state as { habits: Array<{ id: string }> }).habits[0]!.id;

    const spawn = makeCommandHandler('mother-habit');
    spawn('habit.spawnLane', { habitId });

    const lane = useBoardStore
      .getState()
      .board!.nodes.find((n) => n.kind === 'habit.lane')!;
    const laneHandler = makeCommandHandler(lane.id);
    laneHandler('habit.markDone');

    const mother = useBoardStore
      .getState()
      .board!.nodes.find((n) => n.kind === 'habit' && n.isMother)!;
    const habit = (mother.state as { habits: Array<{ id: string; log: string[] }> }).habits[0]!;
    expect(habit.log.length).toBe(1);
  });
});
