import { describe, it, expect } from 'vitest';
import { NODE_REGISTRY, resolveNodeComponent } from '../../../src/renderer/components/nodes/registry';
import { PomoNode } from '../../../src/renderer/components/nodes/PomoNode';
import { TodoNode } from '../../../src/renderer/components/nodes/TodoNode';
import { HabitNode } from '../../../src/renderer/components/nodes/HabitNode';
import { TerminalNode } from '../../../src/renderer/components/nodes/TerminalNode';
import { UnknownNode } from '../../../src/renderer/components/nodes/UnknownNode';

describe('node registry (Decision #8)', () => {
  it('registers all four mother kinds', () => {
    expect(NODE_REGISTRY['pomo']).toBe(PomoNode);
    expect(NODE_REGISTRY['todo']).toBe(TodoNode);
    expect(NODE_REGISTRY['habit']).toBe(HabitNode);
    expect(NODE_REGISTRY['term']).toBe(TerminalNode);
  });

  it('resolveNodeComponent returns the registered component', () => {
    expect(resolveNodeComponent('pomo')).toBe(PomoNode);
    expect(resolveNodeComponent('todo')).toBe(TodoNode);
    expect(resolveNodeComponent('habit')).toBe(HabitNode);
    expect(resolveNodeComponent('term')).toBe(TerminalNode);
  });

  it('resolveNodeComponent falls back to UnknownNode for unregistered kinds', () => {
    expect(resolveNodeComponent('does.not.exist')).toBe(UnknownNode);
    expect(resolveNodeComponent('')).toBe(UnknownNode);
    expect(resolveNodeComponent('plugin.future')).toBe(UnknownNode);
  });
});
