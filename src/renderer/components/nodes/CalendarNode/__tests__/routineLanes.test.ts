import { describe, expect, it } from 'vitest';
import { routineLanes } from '../routineLanes';

describe('routineLanes — overlapping routines sit side by side', () => {
  it('one routine alone takes the whole day', () => {
    expect(routineLanes([{ id: 'a', startMin: 660, endMin: 720 }]).get('a')).toEqual({ lane: 0, lanes: 1 });
  });

  it('two at the same time get a lane each (the 11:00 bug)', () => {
    const l = routineLanes([
      { id: 'fgreg', startMin: 660, endMin: 720 },
      { id: 'hhr', startMin: 660, endMin: 720 },
    ]);
    expect(l.get('fgreg')).toEqual({ lane: 0, lanes: 2 });
    expect(l.get('hhr')).toEqual({ lane: 1, lanes: 2 });
  });

  it('touching routines do not share; a later one reuses a free lane', () => {
    const l = routineLanes([
      { id: 'a', startMin: 600, endMin: 720 },
      { id: 'b', startMin: 660, endMin: 780 },
      { id: 'c', startMin: 720, endMin: 800 }, // a has ended: c takes lane 0
      { id: 'd', startMin: 900, endMin: 960 }, // after the group: alone
    ]);
    expect(l.get('a')).toEqual({ lane: 0, lanes: 2 });
    expect(l.get('b')).toEqual({ lane: 1, lanes: 2 });
    expect(l.get('c')).toEqual({ lane: 0, lanes: 2 });
    expect(l.get('d')).toEqual({ lane: 0, lanes: 1 });
  });
});
