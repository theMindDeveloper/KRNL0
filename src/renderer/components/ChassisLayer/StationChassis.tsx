/* StationChassis — screen-anchored ChassisLayer path for Station Mode.
 *
 * ADR 0008 § 2.6 / § 12 required change #5.
 *
 * Renders the same decorative chrome content (SynthesizerChrome /
 * TelemetryChrome / KrnlDockChrome) as CanvasChassis, but positioned in
 * screen-space rather than ViewportPortal flow-space.
 *
 * The chassis wraps the station's top-row mother panels.  Its position and
 * width are derived from the viewport + layoutGeometry so that the rails
 * align with the actual panel boundaries after the user resizes them.
 *
 * DOM equivalence (NF8 / chassis-parity test):
 *   - Same className: `dock-chassis dock-${dockStyle}`
 *   - data-testid="station-chassis"
 *   - Same child components: SynthesizerChrome / TelemetryChrome / KrnlDockChrome
 *   Only the positioning differs (screen-space div vs ViewportPortal).
 */

import type { DockStyle } from './useDockStyle';
import { SynthesizerChrome } from './SynthesizerChrome';
import { TelemetryChrome } from './TelemetryChrome';
import { KrnlDockChrome } from './KrnlDockChrome';
import { useBoardStore } from '../../store/boardStore';
import { SLOT_DEFAULTS } from '../Station/SlotResolver';

// Top-row height as a fraction of the viewport when no geometry is stored.
const DEFAULT_ROW_FRACTION = SLOT_DEFAULTS.rowPercent / 100;

export function StationChassis({ dockStyle }: { dockStyle: DockStyle }) {
  const rowFraction = useBoardStore(
    (s) => s.board?.layoutGeometry?.station?.rowFraction ?? DEFAULT_ROW_FRACTION
  );

  if (dockStyle === 'classic') return null;

  // The chassis overlays the top-row band of the station layout.
  // height = rowFraction * 100vh. Width = 100%.
  const heightPct = `${rowFraction * 100}%`;

  return (
    <div
      data-testid="station-chassis"
      className={`dock-chassis dock-${dockStyle}`}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: heightPct,
        pointerEvents: 'none',
        zIndex: 0,
        overflow: 'hidden',
      }}
    >
      {dockStyle === 'synthesizer' && <SynthesizerChrome />}
      {dockStyle === 'telemetry' && <TelemetryChrome />}
      {dockStyle === 'krnl-dock' && <KrnlDockChrome />}
    </div>
  );
}
