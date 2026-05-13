import { describe, it, expect } from 'vitest';
import { portFor } from '../../scripts/dev-port.mjs';

describe('portFor', () => {
  it('is deterministic: same input path always returns the same port', () => {
    const path = '/home/user/projects/KRNL0-feature-branch';
    const first = portFor(path);
    for (let i = 1; i < 100; i++) {
      expect(portFor(path)).toBe(first);
    }
  });

  it('always returns an integer in [5174, 5273] for any distinct path', () => {
    // 1000 distinct synthetic paths covering a wide variety of strings
    for (let i = 0; i < 1000; i++) {
      const p = `/worktrees/krnl-worktree-${i}/project`;
      const port = portFor(p);
      expect(Number.isInteger(port)).toBe(true);
      expect(port).toBeGreaterThanOrEqual(5174);
      expect(port).toBeLessThanOrEqual(5273);
    }
  });

  it('produces a spread of > 50 distinct ports across 100 different paths', () => {
    const ports = new Set<number>();
    for (let i = 0; i < 100; i++) {
      ports.add(portFor(`/tmp/krnl-${i}`));
    }
    // A healthy hash must distribute into well over half the available 100
    // buckets. If portFor collapses to a single value this set has size 1.
    expect(ports.size).toBeGreaterThan(50);
  });

  it('handles an empty string input and still returns an in-range integer', () => {
    const port = portFor('');
    expect(Number.isInteger(port)).toBe(true);
    expect(port).toBeGreaterThanOrEqual(5174);
    expect(port).toBeLessThanOrEqual(5273);
  });

  it('handles Windows-style backslash paths and returns an in-range integer', () => {
    const port = portFor('C:\\Users\\momo\\Desktop\\krnl\\KRNL0-port-isolation');
    expect(Number.isInteger(port)).toBe(true);
    expect(port).toBeGreaterThanOrEqual(5174);
    expect(port).toBeLessThanOrEqual(5273);
  });
});
