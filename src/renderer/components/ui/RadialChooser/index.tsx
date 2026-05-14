// ADR 0002 — RadialChooserHost component (amended 2026-05-14 per A1 + A2).
// Mount once at the App root. Portals to document.body.
// Reads state from the module-level radialBus singleton.
// A1: Chooser opens on DROP (not dragover). Confirmation is a pointer CLICK on a
//     wedge. Dead-zone click or outside-click cancels. Escape cancels.
// A2: Apple Liquid Glass aesthetic — backdrop blur, translucent dark wedges,
//     per-wedge stroke accent, entry bounce animation.

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { radialBus } from './bus';
import { RADIAL_CHOOSER_Z } from './types';
import type { ChooserSession, RadialOption } from './types';
import './RadialChooser.css';

export { useRadialChooser } from './useRadialChooser';
export type { RadialOption, RadialChooserOptions, RadialChooserHandle } from './types';
export { RADIAL_CHOOSER_Z } from './types';

// ── Geometry helpers ────────────────────────────────────────────────────────

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

// SVG arc path for a wedge centred at (0,0) from startAngle to endAngle (radians),
// with inner radius and outer radius.
function wedgePath(
  startAngle: number,
  endAngle: number,
  inner: number,
  outer: number,
): string {
  const x1o = outer * Math.cos(startAngle);
  const y1o = outer * Math.sin(startAngle);
  const x2o = outer * Math.cos(endAngle);
  const y2o = outer * Math.sin(endAngle);
  const x1i = inner * Math.cos(endAngle);
  const y1i = inner * Math.sin(endAngle);
  const x2i = inner * Math.cos(startAngle);
  const y2i = inner * Math.sin(startAngle);
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  return [
    `M ${x1o} ${y1o}`,
    `A ${outer} ${outer} 0 ${largeArc} 1 ${x2o} ${y2o}`,
    `L ${x1i} ${y1i}`,
    `A ${inner} ${inner} 0 ${largeArc} 0 ${x2i} ${y2i}`,
    'Z',
  ].join(' ');
}

// Inset wedge path for inner highlight ring (slightly inset from outer edge).
function innerHighlightPath(
  startAngle: number,
  endAngle: number,
  inner: number,
  outer: number,
): string {
  const inset = 1;
  return wedgePath(startAngle, endAngle, inner + inset, outer - inset);
}

// Compute angle in radians of cursor relative to the chooser origin.
// Returns a value in [-π, π].
function cursorAngle(
  cx: number,
  cy: number,
  mx: number,
  my: number,
): number {
  return Math.atan2(my - cy, mx - cx);
}

// Compute the squared distance from cursor to chooser origin.
function distSq(cx: number, cy: number, mx: number, my: number): number {
  return (mx - cx) ** 2 + (my - cy) ** 2;
}

interface WedgeAngles {
  start: number;
  end: number;
  mid: number;
}

// Build the sweep angles for each wedge per ADR §1 geometry rules.
function buildWedgeAngles(n: number, wedgeGap: number, outer: number): WedgeAngles[] {
  if (n === 0) return [];

  // Convert gap from arc-length px to radians at the outer radius.
  const gapRad = wedgeGap / outer;

  if (n === 1) {
    const halfGap = gapRad / 2;
    return [{ start: -Math.PI + halfGap, end: Math.PI - halfGap, mid: 0 }];
  }

  if (n === 2) {
    // Left: options[0] centred at π (180°), right: options[1] centred at 0°.
    const halfGap = gapRad / 2;
    return [
      { start: Math.PI / 2 + halfGap, end: (3 * Math.PI) / 2 - halfGap, mid: Math.PI },
      { start: -(Math.PI / 2) + halfGap, end: Math.PI / 2 - halfGap, mid: 0 },
    ];
  }

  // N >= 3: equal sectors starting at -π/2 (top), clockwise.
  const sweep = (2 * Math.PI) / n;
  const halfGap = gapRad / 2;
  return Array.from({ length: n }, (_, i) => {
    const centreAngle = -Math.PI / 2 + i * sweep;
    return {
      start: centreAngle - sweep / 2 + halfGap,
      end: centreAngle + sweep / 2 - halfGap,
      mid: centreAngle,
    };
  });
}

// Determine which wedge index the cursor angle falls in (or null for dead zone / outside).
function hitTestWedge(
  cx: number,
  cy: number,
  mx: number,
  my: number,
  innerRadius: number,
  outerRadius: number,
  angles: WedgeAngles[],
): number | null {
  const d2 = distSq(cx, cy, mx, my);
  if (d2 <= innerRadius * innerRadius) return null;   // dead zone
  if (d2 > outerRadius * outerRadius) return null;    // outside

  const angle = cursorAngle(cx, cy, mx, my);
  for (let i = 0; i < angles.length; i++) {
    const { start, end } = angles[i]!;
    // Normalise to handle wrapping at ±π.
    let a = angle;
    let s = start;
    let e = end;
    // If the wedge crosses the ±π boundary (n=2 left wedge does).
    if (s > e) {
      // Wedge wraps: [s, π] ∪ [-π, e]
      if (a >= s || a <= e) return i;
    } else {
      if (a >= s && a <= e) return i;
    }
  }
  return null;
}

// ── Subscribed snapshot for useSyncExternalStore ──────────────────────────

function getBusSnapshot(): ChooserSession | null {
  return radialBus.session;
}

function subscribeBus(fn: () => void): () => void {
  return radialBus.subscribe(fn);
}

// ── RadialChooserHost ─────────────────────────────────────────────────────

export function RadialChooserHost() {
  const session = useSyncExternalStore(subscribeBus, getBusSnapshot, getBusSnapshot);
  const anglesRef = useRef<WedgeAngles[]>([]);

  // Exit animation (A2 §7): hold a snapshot of the closing session for 120ms
  // so the host can render with the 'radial-chooser-closing' CSS class before
  // unmounting. useLayoutEffect ensures the closingFrame is set synchronously
  // before the browser paints, preventing a single-frame gap on close.
  const [closingFrame, setClosingFrame] = useState<ChooserSession | null>(null);
  const closingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevSessionRef = useRef<ChooserSession | null>(null);

  useLayoutEffect(() => {
    const prev = prevSessionRef.current;
    prevSessionRef.current = session;

    if (prev !== null && session === null) {
      // Transition: open → closed. Start exit animation.
      setClosingFrame(prev);
      closingTimerRef.current = setTimeout(() => {
        setClosingFrame(null);
        closingTimerRef.current = null;
      }, 120);
    } else if (session !== null && closingTimerRef.current !== null) {
      // New session opened while exit was running — cancel closing animation.
      clearTimeout(closingTimerRef.current);
      closingTimerRef.current = null;
      setClosingFrame(null);
    }
  }, [session]);

  // Clean up pending timer on unmount.
  useEffect(() => {
    return () => {
      if (closingTimerRef.current !== null) clearTimeout(closingTimerRef.current);
    };
  }, []);

  // The session to render: live session takes priority, else closing snapshot.
  const rendered = session ?? closingFrame;
  const isClosing = session === null && closingFrame !== null;

  // Keep angles in sync when session changes.
  if (rendered) {
    anglesRef.current = buildWedgeAngles(
      rendered.options.length,
      rendered.wedgeGap,
      rendered.radius,
    );
  }

  // ── Window-level event listeners when open (A1) ──────────────────────────

  // pointermove: track hovered wedge by angle.
  const handlePointermove = useCallback(
    (e: PointerEvent) => {
      if (!radialBus.session) return;
      const s = radialBus.session;
      const idx = hitTestWedge(
        s.origin.x,
        s.origin.y,
        e.clientX,
        e.clientY,
        s.innerRadius,
        s.radius,
        anglesRef.current,
      );
      radialBus.updateHovered(idx);
    },
    [],
  );

  // click (capture): confirm on wedge, cancel on dead-zone or outside.
  const handleClick = useCallback(
    (e: MouseEvent) => {
      if (!radialBus.session) return;
      e.preventDefault();
      e.stopPropagation();
      const s = radialBus.session;
      const d2 = distSq(s.origin.x, s.origin.y, e.clientX, e.clientY);

      // Inside dead zone → cancel.
      if (d2 <= s.innerRadius * s.innerRadius) {
        const { onCancel } = s;
        radialBus.close();
        onCancel?.();
        return;
      }

      // Outside outer radius → cancel.
      if (d2 > s.radius * s.radius) {
        const { onCancel } = s;
        radialBus.close();
        onCancel?.();
        return;
      }

      // On a wedge → pick.
      const idx = hitTestWedge(
        s.origin.x,
        s.origin.y,
        e.clientX,
        e.clientY,
        s.innerRadius,
        s.radius,
        anglesRef.current,
      );
      if (idx !== null) {
        const opt = s.options[idx];
        if (opt && !('disabled' in opt && opt.disabled)) {
          const { onPick, onCancel: _cancel } = s;
          radialBus.close();
          onPick(opt.value, opt);
          return;
        }
      }

      // Gap between wedges — cancel.
      const { onCancel } = s;
      radialBus.close();
      onCancel?.();
    },
    [],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (!radialBus.session) return;
      const { onCancel } = radialBus.session;
      radialBus.close();
      onCancel?.();
    },
    [],
  );

  useEffect(() => {
    if (!session) return;
    // A1: pointermove for hover tracking, click (capture) for confirm/cancel, keydown for Escape.
    // No drag listeners — the drag has already ended when this chooser opens.
    window.addEventListener('pointermove', handlePointermove);
    window.addEventListener('click', handleClick, { capture: true });
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener('pointermove', handlePointermove);
      window.removeEventListener('click', handleClick, { capture: true });
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [session, handlePointermove, handleClick, handleKeyDown]);

  if (!rendered) return null;

  const { origin, options, radius, innerRadius, hoveredIndex } = rendered;
  const angles = anglesRef.current;

  // ── Render (A2 — Apple Liquid Glass) ─────────────────────────────────────

  const svgSize = (radius + 4) * 2; // a small margin around the outer radius
  const svgLeft = origin.x - svgSize / 2;
  const svgTop = origin.y - svgSize / 2;

  return createPortal(
    // Outer wrapper: fixed full-screen so pointer-events pass through where not
    // occupied. The glass wrapper is absolutely sized to the chooser bounding box.
    <div
      className="radial-chooser-root"
      style={{ zIndex: RADIAL_CHOOSER_Z }}
      data-testid={!isClosing ? 'radial-chooser-host' : undefined}
    >
      {/* A2: backdrop-filter blur wrapper — must wrap SVG, sized to bounding circle */}
      <div
        className={`radial-chooser-glass ${isClosing ? 'radial-chooser-closing' : 'radial-chooser-animate'}`}
        style={{
          left: svgLeft,
          top: svgTop,
          width: svgSize,
          height: svgSize,
          zIndex: RADIAL_CHOOSER_Z,
        }}
      >
        <svg
          className="radial-chooser-svg"
          width={svgSize}
          height={svgSize}
          data-testid="radial-chooser-svg"
        >
          <g transform={`translate(${svgSize / 2}, ${svgSize / 2})`}>
            {/* Wedges — solid fill in the wedge's accent color (purple/cyan).
                Hover bumps brightness via CSS filter. */}
            {options.map((opt, i) => {
              const wa = angles[i];
              if (!wa) return null;
              const isHovered = hoveredIndex === i;
              const wedgeColor = (opt as RadialOption<unknown>).color ?? 'var(--acid)';
              return (
                <g key={opt.id}>
                  <path
                    className={`radial-wedge${isHovered ? ' radial-wedge--hovered' : ''}`}
                    d={wedgePath(wa.start, wa.end, innerRadius, radius)}
                    fill={wedgeColor}
                    data-testid={`radial-wedge-${i}`}
                    data-hovered={isHovered ? 'true' : undefined}
                    style={isHovered ? { filter: `drop-shadow(0 0 12px ${wedgeColor})` } : undefined}
                  />
                  {/* Inner highlight — faint white inset arc for depth */}
                  <path
                    className="radial-wedge-highlight"
                    d={innerHighlightPath(wa.start, wa.end, innerRadius, radius)}
                    fill="none"
                    stroke="rgba(255,255,255,0.22)"
                    strokeWidth={1}
                  />
                </g>
              );
            })}

            {/* Dead zone circle (A2 §6) */}
            <g className={`radial-dead-zone-group`} data-testid="radial-dead-zone-group">
              <circle
                className="radial-dead-zone"
                cx={0}
                cy={0}
                r={innerRadius}
                data-testid="radial-dead-zone"
              />
              <text
                className="radial-dead-glyph"
                x={0}
                y={0}
                textAnchor="middle"
                dominantBaseline="middle"
                data-testid="radial-dead-glyph"
              >
                ×
              </text>
            </g>

            {/* Wedge labels + icons — both white, sized to fit inside the wedge */}
            {options.map((opt, i) => {
              const wa = angles[i];
              if (!wa) return null;
              const isHovered = hoveredIndex === i;
              // Position label at the midpoint angle, 62% of the way between inner and outer.
              const midR = innerRadius + (radius - innerRadius) * 0.62;
              const lx = midR * Math.cos(wa.mid);
              const ly = midR * Math.sin(wa.mid);
              const truncLabel =
                opt.label.length > 12 ? opt.label.slice(0, 11) + '…' : opt.label;

              return (
                <g key={`label-${opt.id}`} style={{ pointerEvents: 'none' }}>
                  {opt.icon && (
                    <text
                      className="radial-wedge-icon"
                      x={lx}
                      y={ly - 7}
                      fill="#ffffff"
                      data-testid={`radial-wedge-icon-${i}`}
                    >
                      {opt.icon}
                    </text>
                  )}
                  <text
                    className="radial-wedge-label"
                    x={lx}
                    y={opt.icon ? ly + 8 : ly}
                    fill="#ffffff"
                    style={isHovered ? { fontWeight: 700 } : undefined}
                    data-testid={`radial-wedge-label-${i}`}
                  >
                    {truncLabel}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </div>,
    document.body,
  );
}
