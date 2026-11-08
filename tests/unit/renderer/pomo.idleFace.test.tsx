// @vitest-environment jsdom
/** New-user review — before Start the face must not look like it is running. */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Blocks } from '../../../src/renderer/components/nodes/PomoNode/variants/Blocks';

afterEach(cleanup);

describe('Blocks face', () => {
  it('not started: no "now" bar, and it says how long the session is', () => {
    const { container } = render(<Blocks m="25" s="00" elapsedPct={0} remainingPct={100} total={25} running={false} />);
    expect(screen.getByText('25 min session')).toBeTruthy();
    expect(container.querySelectorAll('.now').length).toBe(0);
  });
  it('running or paused mid-way: the minute it is in', () => {
    render(<Blocks m="20" s="00" elapsedPct={20} remainingPct={80} total={25} running={false} />);
    expect(screen.getByText('min 6 / 25')).toBeTruthy();
  });
});
