/**
 * EmbeddedCanvasCell — hosts the full <ReactFlow> canvas inside a station panel.
 *
 * ADR 0008 § 2.5 / § 9.3 (strategy A — remount on toggle).
 *
 * The same CanvasFlow component used in canvas mode mounts here.
 * <ReactFlowProvider> stays at App root; both CanvasFlow and EmbeddedCanvasCell
 * are descendants of the same provider.
 *
 * defaultViewport is read from boardStore.viewport so that a mode toggle
 * (which remounts <ReactFlow> once) resumes at the user's last pan/zoom position
 * rather than the library default. This satisfies ADR § 9.3 / § 12 gating
 * prerequisite — viewport survives remount.
 */

import { CanvasFlow } from '../Canvas/CanvasFlow';

export function EmbeddedCanvasCell() {
  return (
    <div
      data-testid="embedded-canvas-cell"
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <CanvasFlow />
    </div>
  );
}
