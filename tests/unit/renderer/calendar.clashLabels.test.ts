/** Letter names for clashing plans (calendar-clock-visuals.md F28) — edge cases. */
import { describe, it, expect } from 'vitest';
import { clashLabels } from '../../../src/renderer/components/nodes/CalendarNode/clashLabels';

describe('clashLabels', () => {
  it('each plan is its first character when those differ', () => {
    expect(clashLabels(['Email', 'Pay rent', 'Groceries', 'Laundry'])).toEqual(['E', 'P', 'G', 'L']);
  });

  it('plans that share a first letter add the first letter of their last word; the others stay one letter', () => {
    expect(clashLabels(['Read chapter A', 'Read chapter B', 'Read chapter C', 'Call with Sam'])).toEqual(['RA', 'RB', 'RC', 'C']);
  });

  it('one-word titles that share a letter use more letters', () => {
    expect(clashLabels(['Email', 'Errands'])).toEqual(['EM', 'ER']);
  });

  it('identical titles are numbered, never two equal names', () => {
    const l = clashLabels(['Focus', 'Focus', 'Focus']);
    expect(new Set(l).size).toBe(3);
    expect(l).toEqual(['F1', 'F2', 'F3']);
  });

  it('skips leading spaces, punctuation and symbols; upper-cases', () => {
    expect(clashLabels(['  #3 deploy', '— review', 'écrire'])).toEqual(['3', 'R', 'É']);
  });

  it('a title with no letter at all still gets a name', () => {
    const l = clashLabels(['***', 'Plan']);
    expect(l[1]).toBe('P');
    expect(l[0]!.length).toBeGreaterThan(0);
  });

  it('non-Latin titles work', () => {
    expect(clashLabels(['読書', '運動'])).toEqual(['読', '運']);
  });

  it('all names are unique for any mix', () => {
    const t = ['Read A', 'Read A', 'Run', 'Rest', 'R', 'r'];
    expect(new Set(clashLabels(t)).size).toBe(t.length);
  });
});
