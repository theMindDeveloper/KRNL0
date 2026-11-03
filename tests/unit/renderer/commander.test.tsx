// @vitest-environment jsdom
/** Commander — checks the plan before launch; the flow reports what really happened. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

vi.mock('../../../src/renderer/components/Assistant/VoicePlayer', () => ({ voicePlayer: { play: () => Promise.resolve() } }));

import { Commander } from '../../../src/renderer/components/Assistant/Commander';
import { sessionFromCommanderFlow } from '../../../src/renderer/components/Assistant/flows/sessionFromCommander';
import { normalizeStartInput } from '../../../src/shared/scheduleAt';
import type { BoardSnapshot, FlowStep } from '../../../src/renderer/components/Assistant/types';

afterEach(cleanup);

function fill(label: string, tasks: string, start = '') {
  const onLaunch = vi.fn();
  render(<Commander onClose={() => {}} onLaunch={onLaunch} />);
  fireEvent.change(screen.getByPlaceholderText('e.g. morning routine'), { target: { value: label } });
  fireEvent.change(screen.getByPlaceholderText(/review notes/), { target: { value: tasks } });
  fireEvent.change(screen.getByPlaceholderText('2026-05-15T10:00'), { target: { value: start } });
  const launch = screen.getByText('› launch session').closest('button')!;
  return { onLaunch, launch };
}

describe('Commander form', () => {
  it('refuses a start time the scheduler would reject, before anything runs', () => {
    const { launch } = fill('deep work', 'a\nb', '10am');
    expect(launch.disabled).toBe(true);
    expect(screen.getByText(/not a time/)).toBeTruthy();
  });

  it('refuses more than five tasks instead of silently dropping the rest', () => {
    const { launch } = fill('deep work', '1\n2\n3\n4\n5\n6');
    expect(launch.disabled).toBe(true);
    expect(screen.getByText(/too many, remove 1/)).toBeTruthy();
  });

  it('reads HH:MM as today and launches with the normalised time', () => {
    const { launch, onLaunch } = fill('deep work', 'a', '9:05');
    fireEvent.click(launch);
    expect(onLaunch).toHaveBeenCalledWith(expect.objectContaining({ startISO: normalizeStartInput('9:05') }));
    expect(normalizeStartInput('9:05')).toMatch(/T09:05$/);
  });
});

describe('session flow success check', () => {
  const snap = (scheduledTaskTexts: string[]): BoardSnapshot => ({
    nodeCount: 0, taskCount: 0, habitCount: 0, hasPomo: true, hasTodo: true, hasCalendar: true, hasClock: true,
    scheduledTaskCount: scheduledTaskTexts.length, scheduledTaskTexts, chainedTaskCount: 0,
    taskTexts: [], firstTaskText: null, viewport: { x: 0, y: 0, zoom: 1 }, nodePositions: {},
  });

  it('fails when only an older task is scheduled, passes when the new head is', () => {
    const steps = sessionFromCommanderFlow.steps(snap([]), { label: 's', tasks: 'write\nsend', startISO: '2026-11-04T09:00' });
    const verify = steps.find((s): s is Extract<FlowStep, { kind: 'verify' }> => s.kind === 'verify')!;
    expect(verify.predicate(snap(['last week task']))).toBe(false);
    expect(verify.predicate(snap(['last week task', 'write']))).toBe(true);
  });
});
