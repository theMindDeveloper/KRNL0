/* ChassisLayer — 5-line router: canvas → CanvasChassis, station → StationChassis.
 *
 * ADR 0008 § 2.6 / § 12 required change #5.
 *
 * The existing body has been moved to CanvasChassis.tsx.  StationChassis is the
 * new screen-anchored path for Station Mode.  Both render the same decorative
 * content (synth knob rail / telemetry instrument cells / krnl-dock rails).
 *
 * CanvasFlow passes dockStyle as a prop (it already subscribes to useDockStyle
 * for the Dock component).  When mounted outside CanvasFlow (future use), the
 * prop may be omitted and ChassisLayerInner will read it internally.
 */

import { useBoardStore } from '../../store/boardStore';
import { useDockStyle } from './useDockStyle';
import { CanvasChassis } from './CanvasChassis';
import { StationChassis } from './StationChassis';
import type { DockStyle } from './useDockStyle';

interface Props {
  dockStyle?: DockStyle;
}

// Inner component reads dockStyle from the hook only when the caller did not
// provide it — avoids a double subscription when CanvasFlow already subscribes.
function ChassisLayerInner({ dockStyleProp }: { dockStyleProp?: DockStyle }) {
  const [dockStyleHook] = useDockStyle();
  const dockStyle = dockStyleProp ?? dockStyleHook;
  const layoutMode = useBoardStore((s) => s.board?.layoutMode ?? 'canvas');

  if (dockStyle === 'classic') return null;
  if (layoutMode === 'canvas') return <CanvasChassis dockStyle={dockStyle} />;
  return <StationChassis dockStyle={dockStyle} />;
}

export function ChassisLayer({ dockStyle }: Props = {}) {
  // Pass through only when defined — exactOptionalPropertyTypes.
  return dockStyle !== undefined
    ? <ChassisLayerInner dockStyleProp={dockStyle} />
    : <ChassisLayerInner />;
}

// Re-export useDockStyle for callers that import it from this module path.
export { useDockStyle } from './useDockStyle';
