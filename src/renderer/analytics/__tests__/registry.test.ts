import { describe, it, expect, beforeEach } from 'vitest';
import {
  clearDataSources,
  collectAllEvents,
  listDataSources,
  registerDataSource,
  unregisterDataSource,
} from '../registry';
import type { AnalyticsDataSource } from '../types';

const dummy = (id: string, count = 1): AnalyticsDataSource => ({
  id,
  label: id,
  collect() {
    const out = [];
    for (let i = 0; i < count; i++) {
      out.push({
        source: id,
        type: 'task.completed' as const,
        date: '2026-05-10',
      });
    }
    return out;
  },
});

describe('analytics registry', () => {
  beforeEach(() => {
    clearDataSources();
  });

  it('registers and lists sources', () => {
    registerDataSource(dummy('a'));
    registerDataSource(dummy('b'));
    const ids = listDataSources().map((s) => s.id).sort();
    expect(ids).toEqual(['a', 'b']);
  });

  it('re-registering with the same id replaces the prior source', () => {
    registerDataSource(dummy('a', 1));
    registerDataSource(dummy('a', 5));
    expect(listDataSources()).toHaveLength(1);
    const events = collectAllEvents({ nodes: [] });
    expect(events).toHaveLength(5);
  });

  it('unregisterDataSource removes by id', () => {
    registerDataSource(dummy('a'));
    registerDataSource(dummy('b'));
    unregisterDataSource('a');
    expect(listDataSources().map((s) => s.id)).toEqual(['b']);
  });

  it('collectAllEvents merges sources sorted by date', () => {
    registerDataSource({
      id: 'late',
      label: 'late',
      collect: () => [
        { source: 'late', type: 'task.completed', date: '2026-05-12' },
      ],
    });
    registerDataSource({
      id: 'early',
      label: 'early',
      collect: () => [
        { source: 'early', type: 'task.completed', date: '2026-05-10' },
      ],
    });
    const out = collectAllEvents({ nodes: [] });
    expect(out[0]?.date).toBe('2026-05-10');
    expect(out[1]?.date).toBe('2026-05-12');
  });

  it('a throwing source does not break collection', () => {
    registerDataSource({
      id: 'good',
      label: 'good',
      collect: () => [
        { source: 'good', type: 'task.completed', date: '2026-05-10' },
      ],
    });
    registerDataSource({
      id: 'bad',
      label: 'bad',
      collect() {
        throw new Error('nope');
      },
    });
    const out = collectAllEvents({ nodes: [] });
    expect(out).toHaveLength(1);
    expect(out[0]?.source).toBe('good');
  });
});
