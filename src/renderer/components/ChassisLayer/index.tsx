/* ChassisLayer — canvas-mode chrome only.
 *
 * ADR 0008 § 2.6.  In station mode the chassis lives inside StationLayout
 * (which wraps its whole shell in `.dock-chassis dock-{style}`), so when
 * ChassisLayer is mounted from CanvasFlow inside the embedded canvas, it must
 * render nothing — otherwise we'd get duplicate dock chrome.
 */

import { useBoardStore } from '../../store/boardStore';
import { useDockStyle } from './useDockStyle';
import { CanvasChassis } from './CanvasChassis';
import type { DockStyle } from './useDockStyle';

interface Props {
  dockStyle?: DockStyle;
}

function ChassisLayerInner({ dockStyleProp }: { dockStyleProp?: DockStyle }) {
  const [dockStyleHook] = useDockStyle();
  const dockStyle = dockStyleProp ?? dockStyleHook;
  const layoutMode = useBoardStore((s) => s.board?.layoutMode ?? 'canvas');

  if (dockStyle === 'classic') return null;
  if (layoutMode === 'station') return null; // StationLayout owns the chassis
  return <CanvasChassis dockStyle={dockStyle} />;
}

export function ChassisLayer({ dockStyle }: Props = {}) {
  return dockStyle !== undefined
    ? <ChassisLayerInner dockStyleProp={dockStyle} />
    : <ChassisLayerInner />;
}

export { useDockStyle } from './useDockStyle';
