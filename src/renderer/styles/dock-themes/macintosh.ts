/**
 * Macintosh dock theme — the canvas as the 1984 Mac's desktop pattern.
 *
 * Light: signature Mac stipple pattern — a 50% grey dithered desktop
 * background, the iconic look of System 1-6 "Finder" before colour. Dark:
 * Mac under "Dark Mode for Performa" (1990s afterthought) — inverts to a
 * dark grey stipple.
 */

import { defineDockTheme } from '../dockTheme';

export const MACINTOSH_THEME = defineDockTheme(
  { id: 'macintosh', label: 'Macintosh' },
  {
    canvas: `
      /* Light — the Mac Finder "50% grey" stipple. Constructed via two
       * offset radial-gradients on a Mac-white base to get the 1-bit
       * pixel-dither look at 2px cell size. */
      html[data-dock="macintosh"]:not([data-theme="dark"]) .react-flow {
        background:
          /* dither dots */
          radial-gradient(circle at 0 0,   #050505 0.6px, transparent 0.8px) 0 0   / 4px 4px,
          radial-gradient(circle at 2px 2px, #050505 0.6px, transparent 0.8px) 0 0 / 4px 4px,
          linear-gradient(180deg, #d8d2bc 0%, #c4bea8 100%) !important;
        --grid:        rgba(5, 5, 5, 0.18);
        --grid-strong: rgba(5, 5, 5, 0.38);
      }

      /* Dark — inverted Mac stipple, cream dots on near-black */
      html[data-theme="dark"][data-dock="macintosh"] .react-flow {
        background:
          radial-gradient(circle at 0 0,   rgba(245,239,222,0.18) 0.6px, transparent 0.8px) 0 0   / 4px 4px,
          radial-gradient(circle at 2px 2px, rgba(245,239,222,0.18) 0.6px, transparent 0.8px) 0 0 / 4px 4px,
          linear-gradient(180deg, #1a1610 0%, #0e0b08 100%) !important;
        --grid:        rgba(245, 239, 222, 0.10);
        --grid-strong: rgba(245, 239, 222, 0.25);
      }

      /* Subtle CRT vignette on the canvas root — the user is staring
       * through the Mac's 9-inch tube. */
      html[data-dock="macintosh"] .react-flow::before {
        content: '';
        position: absolute;
        inset: 0;
        pointer-events: none;
        background:
          radial-gradient(ellipse 110% 90% at 50% 50%, transparent 60%, rgba(0,0,0,0.20) 100%);
        z-index: 0;
      }
    `,

    chrome: `
      /* Chrome CSS lives in src/renderer/styles/chassis.css (search:
       *   "MACINTOSH 128K chassis"). Migration deferred. */
    `,

    nodes: `
      /* Node-palette CSS lives in src/renderer/styles/chassis.css under
       *   [data-dock="macintosh"] .mother-frame
       * Migration deferred. */
    `,

    toolbar: `
      /* PANELS toolbar reads as a Mac OS menu bar inside the CRT — flat,
       * transparent strip with cream/ink chips. Inset a little from the
       * chrome left/right so the rectangular bar doesn't kiss the case
       * edges (the case has rounded corners + bezel rivets). */
      .dock-chassis.dock-macintosh {
        --station-toolbar-margin: 4px 12px 0;
      }
      .dock-chassis.dock-macintosh [data-testid="station-toolbar"] {
        background: transparent !important;
        border: 0 !important;
        border-bottom: 1px solid var(--mac-bezel-2) !important;
        border-radius: 2px;
        position: relative;
        z-index: 2;
      }
      .dock-chassis.dock-macintosh [data-testid="station-toolbar"] > span {
        color: rgba(245, 220, 160, 0.62) !important;
      }
      .dock-chassis.dock-macintosh [data-testid="station-toolbar"] button {
        color: rgba(245, 220, 160, 0.62) !important;
        background: transparent !important;
        border-color: transparent !important;
      }
      .dock-chassis.dock-macintosh [data-testid="station-toolbar"] button[aria-pressed="true"] {
        background: rgba(245, 220, 160, 0.10) !important;
        color: rgba(255, 240, 200, 0.95) !important;
        border-color: rgba(245, 220, 160, 0.25) !important;
      }
      .dock-chassis.dock-macintosh [data-testid="station-toolbar"] button:hover {
        background: rgba(245, 220, 160, 0.06) !important;
      }
      /* Light-mode Mac (warm beige case) — flip text to dark ink for
         readability on the lighter surface. */
      html:not([data-theme="dark"]) .dock-chassis.dock-macintosh [data-testid="station-toolbar"] > span,
      html:not([data-theme="dark"]) .dock-chassis.dock-macintosh [data-testid="station-toolbar"] button {
        color: var(--mac-ink) !important;
      }
      html:not([data-theme="dark"]) .dock-chassis.dock-macintosh [data-testid="station-toolbar"] button[aria-pressed="true"] {
        background: rgba(20, 16, 8, 0.10) !important;
        border-color: rgba(20, 16, 8, 0.28) !important;
      }
      html:not([data-theme="dark"]) .dock-chassis.dock-macintosh [data-testid="station-toolbar"] button:hover {
        background: rgba(20, 16, 8, 0.06) !important;
      }
    `,
  },
);
