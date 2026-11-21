/**
 * Decision 55 — readable repeating events (calendar-clock-visuals.md, Readable events):
 * the whole name wraps where there is room, then the time, then the place.
 */
import { describe, it, expect } from 'vitest';
import { eventLines, eventTitleAndPlace } from '../../../src/renderer/components/nodes/CalendarNode/eventText';

describe('eventTitleAndPlace', () => {
  it('splits a room written after a long dash, the way timetables do', () => {
    expect(eventTitleAndPlace('B112 Front-End Development (PÜ) – WH C 442')).toEqual({ title: 'B112 Front-End Development (PÜ)', place: 'WH C 442' });
    expect(eventTitleAndPlace('B112 Front-End Development (PCÜ) — WH C 639')).toEqual({ title: 'B112 Front-End Development (PCÜ)', place: 'WH C 639' });
  });

  it('keeps a name whole when the tail is not a room', () => {
    expect(eventTitleAndPlace('Talk — Design review')).toEqual({ title: 'Talk — Design review', place: null });
    expect(eventTitleAndPlace('B53 Projektstudium (PS) - Von der Idee zur iOS App')).toEqual({ title: 'B53 Projektstudium (PS) - Von der Idee zur iOS App', place: null });
  });

  it('falls back to a short note as the place', () => {
    expect(eventTitleAndPlace('Gym', 'Studio 2\nbring a towel')).toEqual({ title: 'Gym', place: 'Studio 2' });
    expect(eventTitleAndPlace('Gym', 'x'.repeat(60))).toEqual({ title: 'Gym', place: null });
  });
});

describe('eventLines', () => {
  const long = 'B101 Ausgewählte Kapitel der Informatik 1 (PÜ): Gruppe 1';

  it('a 90-minute class at the default zoom shows its whole name, the time and the room', () => {
    // 1.5 h at 56 px an hour, in a 260 px column.
    const l = eventLines(84 - 2, 240, long, true);
    expect(l.titleLines).toBe(2);
    expect(l.showTime).toBe(true);
    expect(l.showPlace).toBe(true);
  });

  it('a short block gives its lines to the name first', () => {
    const l = eventLines(36, 240, long, true);
    expect(l.titleLines).toBe(2);
    expect(l.showTime).toBe(false);
    expect(l.showPlace).toBe(false);
  });

  it('a short name leaves room for the time on a small block', () => {
    expect(eventLines(36, 240, 'Gym', false)).toEqual({ titleLines: 1, showTime: true, showPlace: false });
  });

  it('a tall block lets a long name use every line it needs', () => {
    const l = eventLines(200, 90, long, true);
    expect(l.titleLines).toBeGreaterThan(2);
    expect(l.showTime).toBe(true);
  });

  it('nothing is drawn in a sliver', () => {
    expect(eventLines(10, 240, long, true).titleLines).toBe(0);
  });
});
