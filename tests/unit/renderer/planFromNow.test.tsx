// @vitest-environment jsdom
/**
 * Plan from now: a dragged plan snaps to the time now on today's column, and the
 * add card has a small "Now" button (today, from this minute).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';
import { WhenPopover } from '../../../src/renderer/components/ui/WhenPopover';
import { dragTarget, nowMark, SNAP_NOW_MIN } from '../../../src/renderer/components/nodes/CalendarNode/calendarDrag';

afterEach(() => { cleanup(); vi.useRealTimers(); });

const TODAY = '2026-11-23';
const NOW = 7 * 60 + 13; // 07:13
const origin = { day: TODAY, startMin: 7 * 60, endMin: 8 * 60 + 55 };

describe('snap to the time now', () => {
  it('nowMark reads the local day and minute', () => {
    expect(nowMark(new Date(2026, 10, 23, 7, 13))).toEqual({ day: TODAY, min: NOW });
  });

  it('carried in from outside: a start near now lands exactly on now', () => {
    const t = dragTarget({ mode: 'move', origin: null, startMin: null, now: { day: TODAY, min: NOW + 2 }, lenMin: 60, gran: 15, dayChange: true, nowMark: { day: TODAY, min: NOW } });
    expect(t).toEqual({ day: TODAY, startMin: NOW, endMin: NOW + 60 });
  });

  it('carried in: farther than the snap window it stays on the grid', () => {
    const t = dragTarget({ mode: 'move', origin: null, startMin: null, now: { day: TODAY, min: NOW + SNAP_NOW_MIN + 3 }, lenMin: 60, gran: 15, dayChange: true, nowMark: { day: TODAY, min: NOW } });
    expect(t.startMin % 15).toBe(0);
  });

  it('only on today: another day never snaps', () => {
    const t = dragTarget({ mode: 'move', origin: null, startMin: null, now: { day: '2026-11-24', min: NOW }, lenMin: 60, gran: 15, dayChange: true, nowMark: { day: TODAY, min: NOW } });
    expect(t.startMin % 15).toBe(0);
  });

  it('moved on the Calendar: the start snaps to now, the length stays', () => {
    // Grabbed at 07:30, pointer to 07:45 -> raw start 07:15, 2 min from now -> now.
    const t = dragTarget({ mode: 'move', origin: { day: TODAY, startMin: 6 * 60, endMin: 7 * 60 }, startMin: 6 * 60 + 30, now: { day: TODAY, min: 7 * 60 + 45 }, lenMin: 60, gran: 15, dayChange: true, nowMark: { day: TODAY, min: NOW } });
    expect(t).toEqual({ day: TODAY, startMin: NOW, endMin: NOW + 60 });
  });

  it('pulling the top edge snaps to now; the bottom edge never does', () => {
    const top = dragTarget({ mode: 'top', origin, startMin: 7 * 60, now: { day: TODAY, min: 7 * 60 + 14 }, lenMin: 60, gran: 15, dayChange: false, nowMark: { day: TODAY, min: NOW } });
    expect(top.startMin).toBe(NOW);
    const bottom = dragTarget({ mode: 'bottom', origin, startMin: 8 * 60 + 55, now: { day: TODAY, min: 8 * 60 + 55 + 2 }, lenMin: 60, gran: 15, dayChange: false, nowMark: { day: TODAY, min: 8 * 60 + 56 } });
    expect(bottom.endMin).toBe(8 * 60 + 55); // unchanged: the end never snaps to now
  });

  it('without a nowMark nothing changes', () => {
    const t = dragTarget({ mode: 'move', origin: null, startMin: null, now: { day: TODAY, min: NOW }, lenMin: 60, gran: 15, dayChange: true });
    expect(t.startMin).toBe(7 * 60);
  });
});

describe('the Now button on the add card', () => {
  it('sets today and this minute', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 23, 7, 13));
    const onChange = vi.fn();
    const { getByTestId } = render(React.createElement(WhenPopover, {
      x: 10, y: 10, today: TODAY,
      value: { day: '2026-11-25', time: null, lengthMin: null, deadline: null, remindMin: null },
      onApply: vi.fn(), onClose: vi.fn(), onChange, anchorAbove: { left: 10, top: 300 },
    }));
    fireEvent.click(getByTestId('when-now'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ day: TODAY, time: '07:13' }));
  });
});
