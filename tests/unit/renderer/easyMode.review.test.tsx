// @vitest-environment jsdom
/** Easy / Advanced review, 8 Nov 2026 (easy-mode.md D19–D26): each hiding row in both modes. */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { useBoardStore } from '../../../src/renderer/store/boardStore';
import '../../../src/renderer/store/uiMode';
import { WhenPopover } from '../../../src/renderer/components/ui/WhenPopover';
import { HabitAddAsk, DEFAULT_CARD } from '../../../src/renderer/components/nodes/HabitNode/HabitAddAsk';
import { isStationHidden } from '../../../src/renderer/components/Station/stationVisibility';
import { canvasWheelItems } from '../../../src/renderer/components/Canvas/canvasWheel';
import { toursIn, TOURS, stepsFor } from '../../../src/renderer/components/Tour/tours';
import type { Board } from '../../../src/shared/types';

const setMode = (mode: 'easy' | 'advanced') => {
  useBoardStore.setState({ board: { version: 1, nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 }, layoutMode: 'station', uiMode: mode } as unknown as Board });
};
afterEach(() => { cleanup(); setMode('advanced'); });

const when = (value: { deadline: string | null } = { deadline: null }) => (
  <WhenPopover x={0} y={0} today="2026-11-08" value={{ day: null, time: null, lengthMin: null, remindMin: null, ...value }} onApply={() => {}} onClose={() => {}} />
);

describe('D19 — Deadline is Advanced', () => {
  it('Advanced: the plan card has a Deadline tab', () => {
    setMode('advanced');
    render(when());
    expect(screen.queryByTestId('when-tab-deadline')).not.toBeNull();
  });
  it('Easy: no Deadline tab, unless the plan already has one', () => {
    setMode('easy');
    render(when());
    expect(screen.queryByTestId('when-tab-deadline')).toBeNull();
    cleanup();
    render(when({ deadline: '2026-11-12' }));
    expect(screen.queryByTestId('when-tab-deadline')).not.toBeNull();
  });
});

describe('D20 — habit goals are Advanced', () => {
  const card = (simple: boolean, initial = DEFAULT_CARD) => (
    <HabitAddAsk name="Read" anchor={{ left: 0, right: 330, top: 600 }} onAdd={() => {}} onCancel={() => {}} simple={simple} initial={initial} />
  );
  it('Advanced: Times a week and the Goal row', () => {
    render(card(false));
    expect(screen.queryByTestId('habit-ask-mode-week')).not.toBeNull();
    expect(screen.queryByTestId('habit-ask-amount-open')).not.toBeNull();
  });
  it('Easy: days and time only', () => {
    render(card(true));
    expect(screen.queryByTestId('habit-ask-mode-week')).toBeNull();
    expect(screen.queryByTestId('habit-ask-amount-open')).toBeNull();
    expect(screen.queryByTestId('habit-ask-day-1')).not.toBeNull();
    expect(screen.queryByTestId('habit-ask-time')).not.toBeNull();
  });
  it('Easy: a habit that already has a goal shows (and keeps) it', () => {
    render(card(true, { ...DEFAULT_CARD, amount: { target: 8, unit: 'glasses' } }));
    expect(screen.queryByTestId('habit-ask-amount-n')).not.toBeNull();
  });
});

describe('D23 — the Terminal is Advanced', () => {
  const term = { id: 'mother-term', kind: 'term', isMother: true, position: { x: 0, y: 0 }, config: { stationHidden: false }, state: {} } as never;
  it('Advanced: shown when the user opened it', () => {
    setMode('advanced');
    expect(isStationHidden(term)).toBe(false);
  });
  it('Easy: always hidden', () => {
    setMode('easy');
    expect(isStationHidden(term)).toBe(true);
  });
});

describe('D24 — frames are Advanced', () => {
  const noop = () => {};
  const actions = { note: noop, sticky: noop, look: noop, image: noop, mediaFile: noop, frame: noop, pen: noop } as never;
  const keys = () => canvasWheelItems(actions).map((i) => i.key);
  it('Advanced: the wheel has Frame', () => { setMode('advanced'); expect(keys()).toContain('frame'); });
  it('Easy: no Frame', () => { setMode('easy'); expect(keys()).not.toContain('frame'); });
  it('Easy: the page says so (no connection dots)', () => {
    setMode('easy');
    expect(document.documentElement.getAttribute('data-ui-mode')).toBe('easy');
    setMode('advanced');
    expect(document.documentElement.getAttribute('data-ui-mode')).toBe('advanced');
  });
});

describe('Tours follow the mode', () => {
  it('the Terminal tour is listed in Advanced only', () => {
    expect(toursIn('advanced').map((t) => t.id)).toContain('terminal');
    expect(toursIn('easy').map((t) => t.id)).not.toContain('terminal');
  });
  it('no Easy step talks about deadlines, weekly targets or amounts', () => {
    for (const t of toursIn('easy')) {
      // (The step that pitches Advanced names what Advanced adds, on purpose.)
      for (const s of stepsFor(t, 'easy').filter((x) => !x.then)) {
        expect(s.text.toLowerCase(), `${t.id}: ${s.text}`).not.toMatch(/deadline|times a week|weekly target|amount/);
      }
    }
  });
  it('every tour still exists for krnl tour start', () => {
    expect(TOURS.some((t) => t.id === 'terminal')).toBe(true);
  });
});
