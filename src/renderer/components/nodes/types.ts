import type { PointerEvent as ReactPointerEvent } from 'react';
import type { Node } from '../../../shared/types';

// Single shape every node component accepts (Decision #8). Local UI state may
// live inside the component; only `onCommand` is allowed to mutate board state.
export interface NodeProps<TState = unknown, TConfig = unknown> {
  node: Node<TState, TConfig>;
  selected: boolean;
  onCommand: (command: string, args?: Record<string, unknown>) => void;
  onSelect: () => void;
  // Drag is only enabled for child nodes; mothers ignore drag handlers.
  onDragStart?: (e: ReactPointerEvent) => void;
  // Slot reorder props — only provided for mother nodes.
  slotIndex?: number | undefined;
  slotTotal?: number | undefined;
  onMoveLeft?: ((() => void) | undefined);
  onMoveRight?: ((() => void) | undefined);
}
