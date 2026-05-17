// Decision 29 §4 — strict CSV parsing for --weekly --days
// Tests the parser's strict ISO 1-7 integer validation.
import { describe, it, expect } from 'vitest';
import { SysParser } from '../../../src/sys/parser';

function parseSchedule(args: string[]) {
  return SysParser.parse(['habit', 'schedule', ...args]);
}

describe('habit schedule weekly csv strict parsing', () => {
  it('accepts valid ISO 1-7 tokens', () => {
    const cmd = parseSchedule(['ref1', '--weekly', '--days', '1,2,5', '--at', '09:00']);
    expect(cmd).not.toBeNull();
    if (!cmd || cmd.kind !== 'habit' || cmd.sub !== 'schedule') throw new Error('unexpected parse');
    expect(cmd.invalidDays).toBeUndefined();
    expect(cmd.days).toEqual([1, 2, 5]);
    expect(cmd.scheduleKind).toBe('weekly');
  });

  it('accepts all days 1-7', () => {
    const cmd = parseSchedule(['ref1', '--weekly', '--days', '1,2,3,4,5,6,7', '--at', '08:00']);
    if (!cmd || cmd.kind !== 'habit' || cmd.sub !== 'schedule') throw new Error('unexpected parse');
    expect(cmd.invalidDays).toBeUndefined();
    expect(cmd.days).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('accepts duplicate tokens (deduped by handler)', () => {
    const cmd = parseSchedule(['ref1', '--weekly', '--days', '1,1,2', '--at', '09:00']);
    if (!cmd || cmd.kind !== 'habit' || cmd.sub !== 'schedule') throw new Error('unexpected parse');
    // duplicates are ok at parse level; handler dedupes them
    expect(cmd.invalidDays).toBeUndefined();
    expect(cmd.days).toEqual([1, 1, 2]);
  });

  it('rejects string day names', () => {
    const cmd = parseSchedule(['ref1', '--weekly', '--days', 'mon', '--at', '09:00']);
    if (!cmd || cmd.kind !== 'habit' || cmd.sub !== 'schedule') throw new Error('unexpected parse');
    expect(cmd.invalidDays).toBeDefined();
    expect(cmd.invalidDays).toBe('mon');
    expect(cmd.days).toBeUndefined();
  });

  it('rejects "monday"', () => {
    const cmd = parseSchedule(['ref1', '--weekly', '--days', 'monday', '--at', '09:00']);
    if (!cmd || cmd.kind !== 'habit' || cmd.sub !== 'schedule') throw new Error('unexpected parse');
    expect(cmd.invalidDays).toBe('monday');
  });

  it('rejects "8" (out of range)', () => {
    const cmd = parseSchedule(['ref1', '--weekly', '--days', '8', '--at', '09:00']);
    if (!cmd || cmd.kind !== 'habit' || cmd.sub !== 'schedule') throw new Error('unexpected parse');
    expect(cmd.invalidDays).toBe('8');
  });

  it('rejects "0" (out of range)', () => {
    const cmd = parseSchedule(['ref1', '--weekly', '--days', '0', '--at', '09:00']);
    if (!cmd || cmd.kind !== 'habit' || cmd.sub !== 'schedule') throw new Error('unexpected parse');
    expect(cmd.invalidDays).toBe('0');
  });

  it('rejects trailing comma (empty token)', () => {
    const cmd = parseSchedule(['ref1', '--weekly', '--days', '1,', '--at', '09:00']);
    if (!cmd || cmd.kind !== 'habit' || cmd.sub !== 'schedule') throw new Error('unexpected parse');
    expect(cmd.invalidDays).toBeDefined();
    // trailing comma splits to ['1', ''] — '' fails /^[1-7]$/
    expect(cmd.days).toBeUndefined();
  });

  it('rejects "1,2,mon" (mixed)', () => {
    const cmd = parseSchedule(['ref1', '--weekly', '--days', '1,2,mon', '--at', '09:00']);
    if (!cmd || cmd.kind !== 'habit' || cmd.sub !== 'schedule') throw new Error('unexpected parse');
    expect(cmd.invalidDays).toBe('mon');
    expect(cmd.days).toBeUndefined();
  });

  it('sets invalidDays=missing when --days not provided', () => {
    const cmd = parseSchedule(['ref1', '--weekly', '--at', '09:00']);
    if (!cmd || cmd.kind !== 'habit' || cmd.sub !== 'schedule') throw new Error('unexpected parse');
    expect(cmd.invalidDays).toBe('missing --days');
  });

  it('parses --daily without issues', () => {
    const cmd = parseSchedule(['ref1', '--daily', '--at', '09:00']);
    if (!cmd || cmd.kind !== 'habit' || cmd.sub !== 'schedule') throw new Error('unexpected parse');
    expect(cmd.scheduleKind).toBe('daily');
    expect(cmd.invalidDays).toBeUndefined();
    expect(cmd.days).toBeUndefined();
  });

  it('parses --weekdays without issues', () => {
    const cmd = parseSchedule(['ref1', '--weekdays', '--at', '08:30', '--duration', '30']);
    if (!cmd || cmd.kind !== 'habit' || cmd.sub !== 'schedule') throw new Error('unexpected parse');
    expect(cmd.scheduleKind).toBe('weekdays');
    expect(cmd.durationMin).toBe(30);
    expect(cmd.invalidDays).toBeUndefined();
  });
});
