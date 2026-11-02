// Decision 32 — Analytics as a fixed mother window.
//
// Hosts the existing dashboard (AnalyticsNode) inside the shared MotherFrame so
// it gets the same badge, corner brackets and drag-to-swap target as Pomo /
// Todo / Habit / Calendar / Clock. The dashboard internals stay in index.tsx
// untouched; only the hosting changes. A legacy non-mother analytics node
// (never written by current code — the migration adopts them) still renders
// bare so an un-migrated board can't crash.

import { MotherFrame, MOTHER_WIDTH, MOTHER_TOTAL } from '../MotherFrame';
import type { NodeProps } from '../types';
import { AnalyticsNode } from './index';
import type { AnalyticsConfig, AnalyticsState } from './types';

export function AnalyticsMother(props: NodeProps<AnalyticsState, AnalyticsConfig>) {
  const { node, slotIndex = 7, slotTotal = MOTHER_TOTAL } = props;
  if (!node.isMother) return <AnalyticsNode {...props} />;
  return (
    <MotherFrame
      nodeId={node.id}
      slotIndex={slotIndex}
      slotTotal={slotTotal}
      width={MOTHER_WIDTH}
      position={node.position}
      background="transparent"
      borderColor="transparent"
    >
      <div data-testid="analytics-mother" style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <AnalyticsNode {...props} />
      </div>
    </MotherFrame>
  );
}
