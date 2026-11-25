/** time-log F22 — finding a name you used from a few letters. */
import { describe, it, expect } from 'vitest';
import { nameKey, nameScore, initialsOf, usedNames } from '../../../src/renderer/components/nodes/PomoNode/nameMatch';

describe('nameScore', () => {
  it('finds a name by its start, a word start, its initials or inside', () => {
    expect(nameScore('Age of Empires 2', 'age of  empires 2')).toBe(100);
    expect(nameScore('age', 'Age of Empires 2')).toBe(80);
    expect(nameScore('emp', 'Age of Empires 2')).toBe(60);
    expect(nameScore('aoe', 'Age of Empires 2')).toBe(50);
    expect(nameScore('pires', 'Age of Empires 2')).toBe(30);
    expect(nameScore('chess', 'Age of Empires 2')).toBe(0);
  });
  it('initials and keys', () => {
    expect(initialsOf('Age of Empires 2')).toBe('aoe2');
    expect(nameKey('  Age  of Empires 2 ')).toBe('age of empires 2');
  });
});

describe('usedNames', () => {
  it('newest first, one per name, minutes added up, breaks and empty spans left out', () => {
    const h = [
      { label: 'aoe2 ', durationMin: 30, kind: 'work' },
      { label: 'Emails', durationMin: 20, kind: 'work', tag: 'admin' },
      { label: '', durationMin: 5, kind: 'work' },
      { label: 'Break', durationMin: 5, kind: 'break' },
      { label: 'API', taskId: 't1', durationMin: 60, kind: 'work' },
      { label: 'AOE2', durationMin: 40, kind: 'work', tag: 'writing' },
    ];
    expect(usedNames(h)).toEqual([
      { label: 'AOE2', tag: 'writing', taskId: null, minutes: 70 },
      { label: 'API', tag: null, taskId: 't1', minutes: 60 },
      { label: 'Emails', tag: 'admin', taskId: null, minutes: 20 },
    ]);
  });
});
