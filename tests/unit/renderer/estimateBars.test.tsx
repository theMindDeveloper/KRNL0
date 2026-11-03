// @vitest-environment jsdom
/** Plan vs actual: tasks that don't fit are counted, not dropped. */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { EstimateBars } from '../../../src/renderer/analytics/charts/PlanVsActual';
import type { TaskEstimate } from '../../../src/renderer/analytics/estimates';

afterEach(cleanup);
const task = (i: number): TaskEstimate => ({ taskId: `t${i}`, text: `task ${i}`, plannedMin: 30, trackedMin: 20, ratio: 0.66, done: false, deleted: false });

describe('EstimateBars', () => {
  it('shows "+N more" for the tasks past the box', () => {
    render(<EstimateBars tasks={Array.from({ length: 12 }, (_, i) => task(i))} width={400} height={130} />);
    // 130px fits 5 rows: 4 tasks + the "+8 more" line.
    expect(screen.getByTestId('analytics-estimate-more').textContent).toContain('+8 more');
  });

  it('no "+N" when everything fits', () => {
    render(<EstimateBars tasks={[task(1), task(2)]} width={400} height={130} />);
    expect(screen.queryByTestId('analytics-estimate-more')).toBeNull();
  });
});
