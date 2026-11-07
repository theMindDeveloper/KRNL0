/** Calendar layers: the header switches and `krnl cal layers` share one state (calendar.setLayers). */
import { describe, it, expect } from 'vitest';
import { calendarSetLayers } from '../../../src/renderer/components/nodes/CalendarNode/commands';
import { calendarLayersOf, CalendarStateSchema } from '../../../src/renderer/components/nodes/CalendarNode/types';
import { SysParser } from '../../../src/sys/parser';
const parseCommand = (a: string[]) => SysParser.parse(a);

const base = { selectedDate: null, anchorDate: '2026-11-06' };

describe('calendar layers', () => {
  it('default to both on when missing (older boards)', () => {
    expect(calendarLayersOf(base)).toEqual({ recorded: true, habits: true });
  });
  it('setLayers changes only the layer given, and only with a boolean', () => {
    const off = calendarSetLayers(base, { habits: false });
    expect(off.layers).toEqual({ recorded: true, habits: false });
    expect(calendarSetLayers(off, { recorded: 'no' }).layers).toEqual({ recorded: true, habits: false });
  });
  it('the schema accepts boards with and without layers', () => {
    expect(CalendarStateSchema.safeParse(base).success).toBe(true);
    expect(CalendarStateSchema.safeParse({ ...base, layers: { recorded: false, habits: true } }).success).toBe(true);
  });
  it('parses krnl cal layers', () => {
    expect(parseCommand(['cal', 'layers'])).toMatchObject({ kind: 'cal', sub: 'layers', layer: undefined });
    expect(parseCommand(['cal', 'layers', 'habits', 'off'])).toMatchObject({ kind: 'cal', sub: 'layers', layer: 'habits', on: 'off' });
  });
});
