/** `task schedule --at` validation and the task.next loop guard. */
import { describe, it, expect } from 'vitest';
import { normalizeScheduleAt } from '../../../src/sys/commands/task';
import { wouldCreateChainCycle } from '../../../src/renderer/store/chainWalker';

describe('normalizeScheduleAt', () => {
  it('keeps local minute-precision input as-is', () => {
    expect(normalizeScheduleAt('2026-11-02T09:30')).toBe('2026-11-02T09:30');
  });

  it('drops seconds so the selector compares like with like', () => {
    expect(normalizeScheduleAt('2026-11-02T09:30:45')).toBe('2026-11-02T09:30');
  });

  it('converts UTC / offset input to local time', () => {
    const local = new Date('2026-11-02T08:00:00Z');
    const pad = (n: number) => String(n).padStart(2, '0');
    const expected = `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}T${pad(local.getHours())}:${pad(local.getMinutes())}`;
    expect(normalizeScheduleAt('2026-11-02T08:00:00Z')).toBe(expected);
  });

  it.each(['tomorrow 3pm', '2026-11-02', '2026-02-30T09:00', '2026-11-02T25:00', ''])('rejects %j', (v) => {
    expect(normalizeScheduleAt(v)).toBeNull();
  });
});

describe('wouldCreateChainCycle', () => {
  const e = (a: string, b: string, event = 'task.next') => ({ from: { nodeId: a, event }, to: { nodeId: b } });

  it('detects closing a direct loop', () => {
    expect(wouldCreateChainCycle([e('a', 'b')], 'b', 'a')).toBe(true);
  });

  it('detects closing a longer loop', () => {
    expect(wouldCreateChainCycle([e('a', 'b'), e('b', 'c')], 'c', 'a')).toBe(true);
  });

  it('allows forks and joins that do not loop', () => {
    expect(wouldCreateChainCycle([e('a', 'b'), e('a', 'c')], 'b', 'c')).toBe(false);
  });

  it('ignores non-chain edges', () => {
    expect(wouldCreateChainCycle([e('a', 'b', 'link')], 'b', 'a')).toBe(false);
  });

  it('treats a self-link as a loop', () => {
    expect(wouldCreateChainCycle([], 'a', 'a')).toBe(true);
  });
});
