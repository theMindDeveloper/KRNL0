// @vitest-environment jsdom
/**
 * Owner, 2026-11-24: the top of the Calendar took a lot of room, and the
 * "Nothing from Google Calendar this week" note was always there. The note now
 * sits inside the empty ANY TIME strip (no row of its own), its × hides it
 * (layer `linkedNote`; Calendar menu and `krnl cal layers note on|off` bring it
 * back), and the every-other-hour shade is a slight accent.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { readFileSync } from 'fs';
import { join } from 'path';
import React from 'react';
import { WeekView } from '../../../src/renderer/components/nodes/CalendarNode/WeekView';
import { calendarSetLayers } from '../../../src/renderer/components/nodes/CalendarNode/commands';
import { calendarLayersOf, type CalendarConfig, type CalendarState } from '../../../src/renderer/components/nodes/CalendarNode/types';
import { useBoardStore } from '../../../src/renderer/store/boardStore';
import type { Board } from '../../../src/shared/types';

const pad = (n: number) => String(n).padStart(2, '0');
const d0 = new Date();
const TODAY = `${d0.getFullYear()}-${pad(d0.getMonth() + 1)}-${pad(d0.getDate())}`;
const LATER = `${d0.getFullYear() + 1}-04-19`;

function seed(): void {
  const board = {
    version: 1, schemaVersion: 2, savedAt: new Date().toISOString(), layoutMode: 'station',
    viewport: { x: 0, y: 0, zoom: 1 }, edges: [], nodes: [],
    calendarLinks: [{
      id: 'g1', kind: 'google', name: 'Google Calendar', color: 'lilac', on: true, provider: 'google', timeZone: 'Europe/Berlin', device: 'd1',
      events: [{ id: 'bday', title: 'Birthday', start: `${LATER}T10:00`, end: `${LATER}T11:00` }],
    }],
  } as unknown as Board;
  useBoardStore.setState({ board });
}

const calState = (extra: Partial<CalendarState> = {}): CalendarState => ({ selectedDate: null, anchorDate: TODAY, zoom: 1, ...extra } as CalendarState);
const calConfig = (): CalendarConfig => ({ view: 'week', weekStartsOn: 'monday', showHabits: true, showPomoHeatmap: true, hourRange: { start: 0, end: 23 } } as CalendarConfig);

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(`${TODAY}T12:00:00`)); });
afterEach(() => { vi.useRealTimers(); cleanup(); useBoardStore.setState({ board: null }); });

describe('the note about the other calendars', () => {
  it('sits inside the empty ANY TIME strip, not on a row of its own', () => {
    seed();
    render(<WeekView state={calState()} config={calConfig()} onCommand={() => {}} />);
    const hint = screen.getByTestId('calendar-linked-hint');
    expect(hint.textContent).toContain('Nothing from Google Calendar this week');
    expect(hint.closest('[data-testid="calendar-day-only-row"]')).not.toBeNull();
  });

  it('its × hides it for good (the linkedNote layer)', () => {
    seed();
    const onCommand = vi.fn();
    render(<WeekView state={calState()} config={calConfig()} onCommand={onCommand} />);
    fireEvent.click(screen.getByTestId('calendar-linked-hint-hide'));
    expect(onCommand).toHaveBeenCalledWith('calendar.setLayers', { linkedNote: false });
  });

  it('is not shown while the layer is off', () => {
    seed();
    const off = calendarSetLayers(calState(), { linkedNote: false });
    expect(calendarLayersOf(off).linkedNote).toBe(false);
    expect(calendarLayersOf(off).linked).toBe(true);
    render(<WeekView state={off} config={calConfig()} onCommand={() => {}} />);
    expect(screen.queryByTestId('calendar-linked-hint')).toBeNull();
  });

  it('the Calendar menu and the CLI can bring it back', () => {
    const idx = readFileSync(join(process.cwd(), 'src/renderer/components/nodes/CalendarNode/index.tsx'), 'utf8');
    expect(idx).toContain("onCommand('calendar.setLayers', { linkedNote: !layers.linkedNote })");
    const cli = readFileSync(join(process.cwd(), 'src/sys/commands/cal.ts'), 'utf8');
    expect(cli).toContain("layer === 'note' ? 'linkedNote' : layer");
  });
});

describe('hour rows', () => {
  it('no hour is shaded differently from the next (owner, 2026-11-24: stripes, even at 1.1 %)', () => {
    const src = readFileSync(join(process.cwd(), 'src/renderer/components/nodes/CalendarNode/WeekView.tsx'), 'utf8');
    expect(src).not.toContain('CAL_HOUR_BAND');
    expect(src).not.toMatch(/hour % 2 === 1 \?/);
  });
});
