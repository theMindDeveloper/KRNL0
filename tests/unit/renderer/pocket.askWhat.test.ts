/** pocket-timer.md F13 — the floating timer may name a span that just ended (Observe). */
import { describe, it, expect } from 'vitest';
import { isPocketLabelArgs, spanToName, isPomoControlCommand, POCKET_LABEL_COMMAND } from '../../../src/renderer/components/nodes/PomoNode/derive';

const NOW = Date.parse('2026-11-06T10:00:00Z');
const rec = (id: string, end: string, extra: Record<string, unknown> = {}) => ({
  id, kind: 'work', completed: true, startedAt: '2026-11-06T09:30:00Z', endedAt: end, taskId: null, label: '', ...extra,
});

describe('spanToName (F13)', () => {
  it('asks about the newest unnamed work span that ended in the last 20 minutes', () => {
    const h = [rec('a', '2026-11-06T09:20:00Z'), rec('b', '2026-11-06T09:55:00Z')];
    expect(spanToName(h as never, NOW)?.id).toBe('b');
  });
  it('stays quiet when the span is named, linked to a task, or old', () => {
    expect(spanToName([rec('b', '2026-11-06T09:55:00Z', { label: 'Reading' })] as never, NOW)).toBeNull();
    expect(spanToName([rec('b', '2026-11-06T09:55:00Z', { taskId: 't1' })] as never, NOW)).toBeNull();
    expect(spanToName([rec('b', '2026-11-06T09:30:00Z')] as never, NOW)).toBeNull();
    expect(spanToName([], NOW)).toBeNull();
  });
  it('a break after the span does not hide it', () => {
    const h = [rec('b', '2026-11-06T09:50:00Z'), { ...rec('x', '2026-11-06T09:58:00Z'), kind: 'break' }];
    expect(spanToName(h as never, NOW)?.id).toBe('b');
  });
});

describe('isPocketLabelArgs (F13) — main only forwards a well-formed label', () => {
  it('accepts the one shape the pocket sends', () => {
    expect(isPocketLabelArgs({ id: 'b', taskId: null, label: 'Reading', tag: 'read' })).toBe(true);
    expect(isPocketLabelArgs({ id: 'b', taskId: null, label: 'Reading' })).toBe(true);
  });
  it('refuses anything else', () => {
    expect(isPocketLabelArgs(null)).toBe(false);
    expect(isPocketLabelArgs({ id: '', taskId: null, label: 'x' })).toBe(false);
    expect(isPocketLabelArgs({ id: 'b', taskId: 't1', label: 'x' })).toBe(false);
    expect(isPocketLabelArgs({ id: 'b', taskId: null, label: '' })).toBe(false);
    expect(isPocketLabelArgs({ id: 'b', taskId: null, label: 'x'.repeat(81) })).toBe(false);
    expect(isPocketLabelArgs({ id: 'b', taskId: null, label: 'x', tag: 5 })).toBe(false);
  });
  it('the label command is not a plain control the pocket can send without arguments', () => {
    expect(isPomoControlCommand(POCKET_LABEL_COMMAND)).toBe(false);
  });
});
