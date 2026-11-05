// @vitest-environment jsdom
/** Guided tours — one per part of the app; steps wait for Next or the real action. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { TOURS, tourById } from '../../../src/renderer/components/Tour/tours';
import { TourHost, startTour } from '../../../src/renderer/components/Tour/TourHost';
import { SysParser } from '../../../src/sys/parser';

describe('tour catalogue', () => {
  it('has a tour for each part of the app', () => {
    expect(TOURS.map((t) => t.id)).toEqual(['welcome', 'pomo', 'todo', 'calendar', 'clock', 'habits', 'analytics', 'modes', 'terminal']);
    for (const t of TOURS) {
      expect(t.steps.length).toBeGreaterThan(1);
      for (const s of t.steps) expect(s.text.length).toBeGreaterThan(10);
    }
    expect(tourById('nope')).toBeUndefined();
  });
});

describe('TourHost', () => {
  afterEach(() => { cleanup(); document.body.innerHTML = ''; });
  it('shows a step, Next moves on, Esc ends', () => {
    render(<TourHost />);
    act(() => { expect(startTour('welcome')).toBe(true); });
    expect(screen.getByTestId('tour-card').textContent).toContain('1 / ');
    act(() => { fireEvent.click(screen.getByTestId('tour-next')); });
    expect(screen.getByTestId('tour-card').textContent).toContain('2 / ');
    act(() => { fireEvent.keyDown(window, { key: 'Escape' }); });
    expect(screen.queryByTestId('tour-card')).toBeNull();
  });

  it('a step that waits for a click advances when the user clicks it', () => {
    vi.useFakeTimers();
    const target = document.createElement('button');
    target.setAttribute('data-testid', 'clock-week-toggle');
    document.body.appendChild(target);
    render(<TourHost />);
    act(() => { startTour('clock'); });
    // go to the "press WEEK" step
    act(() => { fireEvent.click(screen.getByTestId('tour-next')); });
    act(() => { fireEvent.click(screen.getByTestId('tour-next')); });
    expect(screen.getByTestId('tour-text').textContent).toMatch(/WEEK/);
    expect(screen.queryByTestId('tour-next')).toBeNull(); // waiting, no Next
    act(() => { target.click(); vi.advanceTimersByTime(400); });
    expect(screen.getByTestId('tour-text').textContent).toMatch(/Each clock is a day/);
    vi.useRealTimers();
  });
});

describe('krnl tour', () => {
  it('parses list / start', () => {
    expect(SysParser.parse(['tour'])).toEqual({ kind: 'tour', sub: 'list' });
    expect(SysParser.parse(['tour', 'start', 'pomo'])).toEqual({ kind: 'tour', sub: 'start', id: 'pomo' });
  });
});
