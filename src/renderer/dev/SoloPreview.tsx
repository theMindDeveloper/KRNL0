// DEV-ONLY: render a single mother node full-viewport (`?solo=calendar`) so
// layout work can be screenshotted at a readable size in the browser preview.
import { useEffect } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { useBoardStore } from '../store/boardStore';
import { NODE_REGISTRY } from '../components/nodes/registry';
import { MotherFrameStationContext, MOTHER_TOTAL } from '../components/nodes/MotherFrame';
import { makeCommandHandler } from '../components/Canvas/commandDispatch';
import type { Board } from '../../shared/types';

export function SoloPreview({ kind }: { kind: string }) {
  const setBoard = useBoardStore((s) => s.setBoard);
  const node = useBoardStore(
    (s) => s.board?.nodes.find((n) => n.isMother && n.kind === kind) ?? s.board?.nodes.find((n) => n.kind === kind) ?? null,
  );

  useEffect(() => {
    void window.krnl?.boardLoad().then((b) => setBoard(b as Board));
  }, [setBoard]);

  if (!node) return <div style={{ color: '#888', padding: 24 }}>no {kind} mother</div>;
  const Component = NODE_REGISTRY[node.kind];
  if (!Component) return null;
  return (
    <ReactFlowProvider>
    <MotherFrameStationContext.Provider value={true}>
      <div style={{ position: 'fixed', inset: 0, background: 'var(--bg, #111)' }}>
        <Component
          node={node}
          selected={false}
          onCommand={makeCommandHandler(node.id)}
          onSelect={() => {}}
          slotIndex={1}
          slotTotal={MOTHER_TOTAL}
        />
      </div>
    </MotherFrameStationContext.Provider>
    </ReactFlowProvider>
  );
}
