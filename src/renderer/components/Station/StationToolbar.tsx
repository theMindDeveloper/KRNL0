/**
 * StationToolbar — top-of-shell strip with toggle icons for every panel.
 *
 * Replaces the per-cell right-click → Hide UX. One row of 7 buttons:
 * Pomo · Todo · Habit · Calendar · Clock · Terminal · Canvas. Each button
 * is a toggle:
 *   - Active state = panel visible
 *   - Inactive state = panel hidden (omitted from the layout; neighbours
 *     stretch to fill the freed space)
 *
 * Mother visibility writes config.stationHidden on the node.
 * Canvas visibility writes layoutGeometry.station.canvasHidden.
 */

import { useBoardStore } from '../../store/boardStore';
import type { NodeKind, Node } from '../../../shared/types/node';
import type { MotherNodeConfig, StationGeometry } from '../../../shared/types';
import { SLOT_DEFAULTS } from './SlotResolver';
import { isStationHidden } from './StationLayout';

interface MotherEntry {
  kind: NodeKind;
  label: string;
}

// Order matches the layout: top-row mothers left → right, then bottom-row.
const MOTHER_ORDER: MotherEntry[] = [
  { kind: 'pomo',     label: 'Pomo' },
  { kind: 'todo',     label: 'Todo' },
  { kind: 'habit',    label: 'Habit' },
  { kind: 'calendar', label: 'Cal' },
  { kind: 'term',     label: 'Term' },
  { kind: 'clock',    label: 'Clock' },
];

function Glyph({ kind, active }: { kind: NodeKind | 'canvas'; active: boolean }) {
  const stroke = active ? 'currentColor' : 'currentColor';
  const opacity = active ? 1 : 0.45;
  const common = {
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke,
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    style: { opacity },
  };
  switch (kind) {
    case 'pomo':
      return (
        <svg {...common}>
          <circle cx="12" cy="13" r="7" />
          <path d="M12 13V8" />
          <path d="M10 4h4" />
          <path d="M12 4v2" />
        </svg>
      );
    case 'todo':
      return (
        <svg {...common}>
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <path d="M8 12l3 3 5-7" />
        </svg>
      );
    case 'habit':
      return (
        <svg {...common}>
          <rect x="3" y="5" width="3" height="14" />
          <rect x="9" y="9" width="3" height="10" />
          <rect x="15" y="3" width="3" height="16" />
        </svg>
      );
    case 'calendar':
      return (
        <svg {...common}>
          <rect x="4" y="5" width="16" height="15" rx="1.5" />
          <path d="M4 10h16M9 3v4M15 3v4" />
        </svg>
      );
    case 'clock':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v4l3 2" />
        </svg>
      );
    case 'term':
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="14" rx="1.5" />
          <path d="M6 10l3 2-3 2M11 14h6" />
        </svg>
      );
    case 'canvas':
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="16" rx="1.5" />
          <circle cx="8" cy="9" r="1" fill="currentColor" stroke="none" />
          <circle cx="14" cy="13" r="1" fill="currentColor" stroke="none" />
          <circle cx="11" cy="17" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    default:
      return null;
  }
}

function ToolbarBtn({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={`${active ? 'Hide' : 'Show'} ${label}`}
      aria-pressed={active}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        padding: '4px 8px',
        background: active ? 'var(--paper-3)' : 'transparent',
        color: active ? 'var(--ink)' : 'var(--ink-3)',
        border: `1px solid ${active ? 'var(--paper-3)' : 'transparent'}`,
        borderRadius: 3,
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        cursor: 'pointer',
        transition: 'background 120ms, color 120ms, border-color 120ms',
        lineHeight: 1,
      }}
    >
      {children}
      <span>{label}</span>
    </button>
  );
}

export function StationToolbar() {
  const board = useBoardStore((s) => s.board);
  const updateNode = useBoardStore((s) => s.updateNode);
  const setLayoutGeometry = useBoardStore((s) => s.setLayoutGeometry);

  if (!board) return null;

  const stationGeo = board.layoutGeometry?.station;
  const canvasHidden = stationGeo?.canvasHidden ?? false;

  const mothers = board.nodes.filter((n) => n.isMother);
  const motherByKind = new Map<string, Node>(mothers.map((m) => [m.kind, m]));

  const toggleMother = (kind: NodeKind) => {
    const m = motherByKind.get(kind);
    if (!m) return;
    const cfg = (m.config ?? {}) as MotherNodeConfig & Record<string, unknown>;
    // Read the effective visibility (factors in the terminal default-hidden
    // rule) so the toggle flips from what the user actually sees, not from
    // the raw undefined/false value of the field.
    const currentlyHidden = isStationHidden(m);
    updateNode(m.id, { config: { ...cfg, stationHidden: !currentlyHidden } });
  };

  const toggleCanvas = () => {
    const next: StationGeometry = {
      rowFraction: stationGeo?.rowFraction ?? SLOT_DEFAULTS.rowPercent / 100,
      columnFractions: stationGeo?.columnFractions ?? [],
      rightColumnSplit: stationGeo?.rightColumnSplit ?? SLOT_DEFAULTS.bottom.canvas / 100,
      canvasHidden: !canvasHidden,
    };
    setLayoutGeometry({ station: next });
  };

  return (
    <div
      data-testid="station-toolbar"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '6px 10px',
        // Outer margin lets per-dock themes inset the toolbar so its
        // rectangular box doesn't kiss the chassis edge (chrome corner
        // radii, brass rails, etc.). Default = no inset.
        margin: 'var(--station-toolbar-margin, 0)',
        background: 'var(--paper-2, rgba(0,0,0,0.2))',
        borderBottom: '1px solid var(--paper-3)',
        flexShrink: 0,
        height: 32,
        boxSizing: 'border-box',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'var(--ink-3)',
          marginRight: 6,
        }}
      >
        panels
      </span>
      {MOTHER_ORDER.map((m) => {
        const node = motherByKind.get(m.kind);
        const active = !!node && !isStationHidden(node);
        return (
          <ToolbarBtn
            key={m.kind}
            active={active}
            label={m.label}
            onClick={() => toggleMother(m.kind)}
          >
            <Glyph kind={m.kind} active={active} />
          </ToolbarBtn>
        );
      })}
      <ToolbarBtn
        active={!canvasHidden}
        label="Canvas"
        onClick={toggleCanvas}
      >
        <Glyph kind="canvas" active={!canvasHidden} />
      </ToolbarBtn>
    </div>
  );
}
