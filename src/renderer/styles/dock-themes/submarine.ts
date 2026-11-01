/**
 * Submarine dock theme — the canvas as the deep-ocean compartment.
 *
 * Dark-only by design. Walnut-brown hull tone with a vertical wood-grain
 * pattern, a faint red emergency-lighting wash from above, and brass-tone
 * dots for the grid. A caustic light ripple sits behind everything — the
 * room is lit from a single low porthole. Rivet-line hatching at the
 * edges reinforces the steel-plated hull.
 */

import { defineDockTheme } from '../dockTheme';

export const SUBMARINE_THEME = defineDockTheme(
  { id: 'submarine', label: 'Submarine' },
  {
    canvas: `
      /* Calm hull. Wood grain, hatching and caustic ripples made nodes hard
       * to see; the canvas keeps one warm gradient and the brass dot grid. */
      html[data-dock="submarine"] .react-flow,
      html[data-theme="dark"][data-dock="submarine"] .react-flow {
        background:
          radial-gradient(ellipse 80% 50% at 50% -10%, rgba(180, 60, 20, 0.08) 0%, transparent 70%),
          linear-gradient(180deg, #17110c 0%, #120d09 100%) !important;
        --grid:        rgba(184, 138, 58, 0.16);
        --grid-strong: rgba(232, 200, 118, 0.30);
      }
    `,

    chrome: `
      /* Chrome CSS lives in src/renderer/styles/chassis.css (search:
       *   "SUBMARINE chassis"). Migration deferred. */
    `,

    nodes: `
      /* Node-palette CSS lives in src/renderer/styles/chassis.css under
       *   [data-dock="submarine"] .mother-frame
       * Migration deferred. */
    `,

    /* ── toolbar — brass-bordered status strip ─────────────────────────── */
    toolbar: `
      .dock-chassis.dock-submarine {
        --station-toolbar-margin: 4px 16px 0;
      }
      .dock-chassis.dock-submarine [data-testid="station-toolbar"] {
        background:
          linear-gradient(180deg, rgba(0,0,0,0.36) 0%, rgba(0,0,0,0.22) 100%) !important;
        border: 1px solid rgba(184, 138, 58, 0.35) !important;
        border-radius: 2px;
        box-shadow:
          inset 0 1px 0 rgba(232, 200, 118, 0.12),
          inset 0 -1px 0 rgba(0,0,0,0.55);
        position: relative;
        z-index: 2;
      }
      .dock-chassis.dock-submarine [data-testid="station-toolbar"] > span {
        color: rgba(232, 200, 118, 0.55) !important;
      }
      .dock-chassis.dock-submarine [data-testid="station-toolbar"] button {
        color: rgba(232, 200, 118, 0.62) !important;
        background: transparent !important;
        border-color: transparent !important;
      }
      .dock-chassis.dock-submarine [data-testid="station-toolbar"] button[aria-pressed="true"] {
        color: rgba(255, 232, 170, 0.95) !important;
        background: rgba(232, 200, 118, 0.10) !important;
        border-color: rgba(232, 200, 118, 0.32) !important;
      }
      .dock-chassis.dock-submarine [data-testid="station-toolbar"] button:hover {
        background: rgba(232, 200, 118, 0.06) !important;
      }
    `,
  },
);
