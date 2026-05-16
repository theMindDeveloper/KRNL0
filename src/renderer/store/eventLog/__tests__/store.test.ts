import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetEventLogForTests, useEventLog } from '../store';
import { emit } from '../emit';
import { EVENT_LOG_MAX } from '../types';

beforeEach(() => {
  __resetEventLogForTests();
});

describe('eventLog store', () => {
  it('push appends entries newest-last', () => {
    useEventLog.getState().push({ kind: 'task.created', text: 'task #A1 created' });
    useEventLog.getState().push({ kind: 'task.completed', text: 'task #A1 completed' });
    const e = useEventLog.getState().entries;
    expect(e).toHaveLength(2);
    expect(e[0]?.text).toBe('task #A1 created');
    expect(e[1]?.text).toBe('task #A1 completed');
  });

  it('push assigns monotonic id and ts', () => {
    useEventLog.getState().push({ kind: 'sys.cmd', text: 'a' });
    useEventLog.getState().push({ kind: 'sys.cmd', text: 'b' });
    const [a, b] = useEventLog.getState().entries;
    expect(a?.id).toBeDefined();
    expect(b?.id).toBeDefined();
    expect(a?.id).not.toBe(b?.id);
    expect(typeof a?.ts).toBe('number');
  });

  it('defaults severity to ok', () => {
    useEventLog.getState().push({ kind: 'sys.cmd', text: 'x' });
    expect(useEventLog.getState().entries[0]?.severity).toBe('ok');
  });

  it('respects explicit severity + refId', () => {
    useEventLog.getState().push({
      kind: 'sys.error',
      text: 'boom',
      severity: 'err',
      refId: 'node-42',
    });
    const e = useEventLog.getState().entries[0];
    expect(e?.severity).toBe('err');
    expect(e?.refId).toBe('node-42');
  });

  it('clear resets entries', () => {
    useEventLog.getState().push({ kind: 'sys.cmd', text: 'x' });
    useEventLog.getState().clear();
    expect(useEventLog.getState().entries).toHaveLength(0);
  });

  it('ring buffer drops oldest when over cap', () => {
    const n = 250;
    for (let i = 0; i < n; i++) {
      useEventLog.getState().push({ kind: 'sys.cmd', text: `cmd ${i}` });
    }
    const entries = useEventLog.getState().entries;
    expect(entries).toHaveLength(EVENT_LOG_MAX);
    // First retained entry must be from after the drop.
    expect(entries[0]?.text).toBe(`cmd ${n - EVENT_LOG_MAX}`);
    expect(entries[entries.length - 1]?.text).toBe(`cmd ${n - 1}`);
  });
});

describe('emit()', () => {
  it('pushes via the store', () => {
    emit('task.completed', 'task #A1 completed', { refId: 'task-1' });
    const e = useEventLog.getState().entries[0];
    expect(e?.kind).toBe('task.completed');
    expect(e?.refId).toBe('task-1');
  });

  it('never throws even if the store throws', () => {
    const spy = vi.spyOn(useEventLog, 'getState').mockImplementation(() => {
      throw new Error('store broken');
    });
    expect(() => emit('sys.cmd', 'safe')).not.toThrow();
    spy.mockRestore();
  });
});
