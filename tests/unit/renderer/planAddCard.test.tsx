// @vitest-environment jsdom
/** Decision 40 — the add card (Todo) and the Minimal Pomo face. */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { effectiveDraft, draftSummary } from '../../../src/renderer/components/nodes/TodoNode/PlanAddCard';
import { Minimal } from '../../../src/renderer/components/nodes/PomoNode/variants/Minimal';

afterEach(cleanup);
const words = { day: '2026-11-10', time: '16:00', lengthMin: 60, deadline: null };

describe('add card: the card wins over the words', () => {
  it('takes the words when nothing was set', () => {
    expect(effectiveDraft(words, {})).toEqual(words);
  });
  it('a day picked on the card replaces the typed one; "No day" clears the time too', () => {
    expect(effectiveDraft(words, { day: '2026-11-12' })).toMatchObject({ day: '2026-11-12', time: '16:00' });
    expect(effectiveDraft(words, { day: null, time: null })).toMatchObject({ day: null, time: null });
  });
  it('any time on the card drops the typed time; a length and deadline can be set', () => {
    expect(effectiveDraft(words, { time: null, lengthMin: 30, deadline: '2026-11-14' })).toEqual({ day: '2026-11-10', time: null, lengthMin: 30, deadline: '2026-11-14' });
  });
  it('the button says what Enter adds', () => {
    expect(draftSummary({ day: '2026-11-10', time: null, lengthMin: 30, deadline: '2026-11-11' }, '2026-11-08')).toBe('Tue, any time · 30m · by Wed');
    expect(draftSummary({ day: '2026-11-08', time: '16:00', lengthMin: null, deadline: null }, '2026-11-08')).toBe('today 16:00');
    expect(draftSummary({ day: null, time: null, lengthMin: null, deadline: null }, '2026-11-08')).toBe('');
  });
});

describe('Minimal Pomo face', () => {
  it('just the time and one word', () => {
    render(<Minimal m="25" s="00" elapsedPct={0} remainingPct={100} running={false} />);
    expect(screen.getByTestId('pomo-face-minimal').textContent).toContain('25:00');
    expect(screen.getByTestId('pomo-face-minimal').textContent).toContain('Ready');
  });
  it('says Focus while running', () => {
    render(<Minimal m="12" s="30" elapsedPct={50} remainingPct={50} running />);
    expect(screen.getByTestId('pomo-face-minimal').textContent).toContain('Focus');
  });
});
