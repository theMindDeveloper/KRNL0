import { describe, it, expect } from 'vitest';
import { NODE_REGISTRY, resolveNodeComponent } from '../../../src/renderer/components/nodes/registry';
import { PomoNode } from '../../../src/renderer/components/nodes/PomoNode';
import { TodoNode } from '../../../src/renderer/components/nodes/TodoNode';
import { HabitNode } from '../../../src/renderer/components/nodes/HabitNode';
import { TerminalNode } from '../../../src/renderer/components/nodes/TerminalNode';
import { UnknownNode } from '../../../src/renderer/components/nodes/UnknownNode';

// Components are wrapped in React.memo at the registry boundary (perf).
// Memo exotic objects expose `.type` pointing back to the underlying component.
function unwrap(C: unknown): unknown {
  if (typeof C === 'object' && C !== null && 'type' in C) {
    return (C as { type: unknown }).type;
  }
  return C;
}

describe('node registry (Decision #8)', () => {
  it('registers all four mother kinds', () => {
    expect(unwrap(NODE_REGISTRY['pomo'])).toBe(PomoNode);
    expect(unwrap(NODE_REGISTRY['todo'])).toBe(TodoNode);
    expect(unwrap(NODE_REGISTRY['habit'])).toBe(HabitNode);
    expect(unwrap(NODE_REGISTRY['term'])).toBe(TerminalNode);
  });

  it('resolveNodeComponent returns the memoized registered component', () => {
    expect(unwrap(resolveNodeComponent('pomo'))).toBe(PomoNode);
    expect(unwrap(resolveNodeComponent('todo'))).toBe(TodoNode);
    expect(unwrap(resolveNodeComponent('habit'))).toBe(HabitNode);
    expect(unwrap(resolveNodeComponent('term'))).toBe(TerminalNode);
  });

  it('resolveNodeComponent falls back to UnknownNode for unregistered kinds', () => {
    expect(resolveNodeComponent('does.not.exist')).toBe(UnknownNode);
    expect(resolveNodeComponent('')).toBe(UnknownNode);
    expect(resolveNodeComponent('plugin.future')).toBe(UnknownNode);
  });
});
