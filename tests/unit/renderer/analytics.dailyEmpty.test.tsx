// @vitest-environment jsdom
/** New-user review 1.4 — an empty range says so instead of drawing bare axes. */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { DailyPlanActual } from '../../../src/renderer/analytics/charts/PlanVsActual';

afterEach(cleanup);

describe('DailyPlanActual', () => {
  it('no data: a sentence, not empty axes', () => {
    render(<DailyPlanActual days={[{ date: '2026-11-08', plannedMin: 0, workedMin: 0 }] as never} width={300} height={160} />);
    expect(screen.getByTestId('analytics-daily-plan-actual-empty').textContent).toContain('Nothing planned');
    expect(screen.queryByTestId('analytics-daily-plan-actual')).toBeNull();
  });
  it('with data: the chart', () => {
    render(<DailyPlanActual days={[{ date: '2026-11-08', plannedMin: 60, workedMin: 30 }] as never} width={300} height={160} />);
    expect(screen.getByTestId('analytics-daily-plan-actual')).toBeTruthy();
  });
});
