// One of the board's own windows (Timer, Plans, Habits, Calendar, Clock,
// Analytics), filling the space it is given. The same component, commands and
// store as the desktop's Station cell (StationCell), so a tap on a phone does
// exactly what a click does on the desktop, and syncs the same way.

import { useCallback } from 'react';
import { useBoardStore } from '../../store/boardStore';
import { NODE_REGISTRY } from '../nodes/registry';
import { MotherFrameStationContext, MOTHER_TOTAL } from '../nodes/MotherFrame';
import { makeCommandHandler } from '../Canvas/commandDispatch';
import { SLOT_INDEX, resolveStationSlot } from '../Station/SlotResolver';

export type MotherKind = 'pomo' | 'todo' | 'habit' | 'calendar' | 'clock' | 'analytics';

export interface MotherWindowProps {
  kind: MotherKind;
  label?: string;
  /** Shown in place of the stored config keys, on this device only (never saved). */
  configOverride?: Record<string, unknown>;
  /** Answers a command here instead of changing the board (true = handled). */
  intercept?: (command: string, args: Record<string, unknown>) => boolean;
}

export function MotherWindow({ kind, label, configOverride, intercept }: MotherWindowProps) {
  const node = useBoardStore((s) => s.board?.nodes.find((n) => n.isMother && n.kind === kind) ?? null);
  const selectNode = useBoardStore((s) => s.selectNode);
  const onSelect = useCallback(() => { if (node) selectNode(node.id); }, [node, selectNode]);
  if (!node) return null;
  const Component = NODE_REGISTRY[node.kind];
  if (!Component) return null;
  const slot = resolveStationSlot(node);
  const shown = configOverride ? { ...node, config: { ...(node.config as Record<string, unknown> | undefined), ...configOverride } } : node;
  const handler = makeCommandHandler(node.id);
  const onCommand = intercept
    ? (command: string, args: Record<string, unknown> = {}): void => { if (!intercept(command, args)) handler(command, args); }
    : handler;
  return (
    <MotherFrameStationContext.Provider value={true}>
      <section className="m-window" data-kind={kind} aria-label={label}>
        <Component
          node={shown}
          selected={false}
          onCommand={onCommand}
          onSelect={onSelect}
          slotIndex={(slot && SLOT_INDEX[slot]) ?? 1}
          slotTotal={MOTHER_TOTAL}
        />
      </section>
    </MotherFrameStationContext.Provider>
  );
}
