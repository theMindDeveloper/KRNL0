import { describe, expect, it } from 'vitest';
import { routineLanes, sharedLanes } from '../routineLanes';

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

describe('sharedLanes — plans and repeating events share one lane plan (Decision 61)', () => {
  it('a plan dropped onto an event sits beside it, never on top', () => {
    const l = sharedLanes([
      { id: 'class', startMin: 840, endMin: 930, kind: 'event' }, // 14:00–15:30
      { id: 'plan', startMin: 870, endMin: 930, kind: 'task' }, // 14:30–15:30
    ]);
    expect(l.get('class')).toEqual({ lane: 0, lanes: 2, mixed: true });
    expect(l.get('plan')).toEqual({ lane: 1, lanes: 2, mixed: true });
  });

  it('the same start time still gives two lanes', () => {
    const l = sharedLanes([
      { id: 'plan', startMin: 600, endMin: 660, kind: 'task' },
      { id: 'class', startMin: 600, endMin: 660, kind: 'event' },
    ]);
    expect(new Set([l.get('plan')!.lane, l.get('class')!.lane])).toEqual(new Set([0, 1]));
    expect(l.get('plan')!.lanes).toBe(2);
  });

  it('only plans, or only events, are not "mixed"; touching ones do not share', () => {
    const l = sharedLanes([
      { id: 'a', startMin: 600, endMin: 660, kind: 'task' },
      { id: 'b', startMin: 630, endMin: 690, kind: 'task' },
      { id: 'c', startMin: 690, endMin: 750, kind: 'event' },
    ]);
    expect(l.get('a')).toEqual({ lane: 0, lanes: 2, mixed: false });
    expect(l.get('b')).toEqual({ lane: 1, lanes: 2, mixed: false });
    expect(l.get('c')).toEqual({ lane: 0, lanes: 1, mixed: false });
  });
});
