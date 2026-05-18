/**
 * Blueprint dock theme — engineering drafting board.
 *
 * Canvas slot is the showcase here: the infinite canvas becomes a real
 * blueprint sheet. Deep navy paper with a cyan grid in dark mode; warm
 * drafting cream with a spine-green grid in light mode. The grid pattern
 * pans with the canvas via RF's Background dots (re-coloured) and is
 * reinforced by a static cross-hatch overlay on the canvas root for that
 * "sheet pinned to the table" feel.
 *
 * Chrome and nodes slots currently delegate to chassis.css — that CSS is
 * settled and the contract here ('always pass all three') is satisfied by
 * pointing at the canonical location. Future docks should populate all
 * three slots inline so a single theme file is the source of truth.
 */

import { defineDockTheme } from '../dockTheme';

export const BLUEPRINT_THEME = defineDockTheme(
  { id: 'blueprint', label: 'Blueprint' },
  {
    /* ── canvas / infinite paper ──────────────────────────────────────── */
    canvas: `
      /* Light theme — warm drafting paper with faint spine-green grid */
      html[data-dock="blueprint"]:not([data-theme="dark"]) .react-flow {
        background:
          radial-gradient(ellipse 70% 60% at 50% 40%, rgba(255,255,255,0.20) 0%, transparent 70%),
          linear-gradient(180deg, #f4ecd2 0%, #e6dbb4 100%) !important;
        --grid:        rgba(94, 125, 29, 0.10);
        --grid-strong: rgba(94, 125, 29, 0.28);
      }
      /* Static cross-hatch grid overlay (16px minor / 96px major).
       * Doesn't pan — gives the viewport the "blueprint sheet" feel even
       * when the user is at deep zoom. Sits BEHIND the panning RF dots. */
      html[data-dock="blueprint"]:not([data-theme="dark"]) .react-flow::before {
        content: '';
        position: absolute;
        inset: 0;
        pointer-events: none;
        background-image:
          linear-gradient(rgba(94,125,29,0.16) 1px, transparent 1px),
          linear-gradient(90deg, rgba(94,125,29,0.16) 1px, transparent 1px),
          linear-gradient(rgba(94,125,29,0.06) 1px, transparent 1px),
          linear-gradient(90deg, rgba(94,125,29,0.06) 1px, transparent 1px);
        background-size: 96px 96px, 96px 96px, 16px 16px, 16px 16px;
        z-index: 0;
        opacity: 0.55;
      }

      /* Dark theme — deep blueprint navy with luminous cyan grid */
      html[data-theme="dark"][data-dock="blueprint"] .react-flow {
        background:
          radial-gradient(ellipse 80% 70% at 50% 50%, rgba(126,200,227,0.06) 0%, transparent 75%),
          linear-gradient(180deg, #08121f 0%, #0c1a2e 50%, #0a1729 100%) !important;
        --grid:        rgba(126, 200, 227, 0.10);
        --grid-strong: rgba(126, 200, 227, 0.30);
      }
      html[data-theme="dark"][data-dock="blueprint"] .react-flow::before {
        content: '';
        position: absolute;
        inset: 0;
        pointer-events: none;
        background-image:
          linear-gradient(rgba(126,200,227,0.14) 1px, transparent 1px),
          linear-gradient(90deg, rgba(126,200,227,0.14) 1px, transparent 1px),
          linear-gradient(rgba(126,200,227,0.05) 1px, transparent 1px),
          linear-gradient(90deg, rgba(126,200,227,0.05) 1px, transparent 1px);
        background-size: 96px 96px, 96px 96px, 16px 16px, 16px 16px;
        z-index: 0;
        opacity: 0.85;
      }

      /* Corner registration marks — classic blueprint "L" brackets at the
       * four corners of the viewport. Fixed, drafting-tool aesthetic. */
      html[data-dock="blueprint"] .react-flow::after {
        content: '';
        position: absolute;
        inset: 16px;
        pointer-events: none;
        z-index: 0;
        background:
          linear-gradient(90deg,  currentColor 0 22px, transparent 22px) top left     / 22px 1.5px no-repeat,
          linear-gradient(180deg, currentColor 0 22px, transparent 22px) top left     / 1.5px 22px no-repeat,
          linear-gradient(270deg, currentColor 0 22px, transparent 22px) top right    / 22px 1.5px no-repeat,
          linear-gradient(180deg, currentColor 0 22px, transparent 22px) top right    / 1.5px 22px no-repeat,
          linear-gradient(90deg,  currentColor 0 22px, transparent 22px) bottom left  / 22px 1.5px no-repeat,
          linear-gradient(0deg,   currentColor 0 22px, transparent 22px) bottom left  / 1.5px 22px no-repeat,
          linear-gradient(270deg, currentColor 0 22px, transparent 22px) bottom right / 22px 1.5px no-repeat,
          linear-gradient(0deg,   currentColor 0 22px, transparent 22px) bottom right / 1.5px 22px no-repeat;
      }
      html[data-dock="blueprint"]:not([data-theme="dark"]) .react-flow::after {
        color: rgba(94, 125, 29, 0.55);
      }
      html[data-theme="dark"][data-dock="blueprint"] .react-flow::after {
        color: rgba(126, 200, 227, 0.50);
      }
    `,

    /* ── chrome — see chassis.css "BLUEPRINT chassis" block ───────────── */
    chrome: `
      /* Chrome CSS lives in src/renderer/styles/chassis.css (search:
       *   "BLUEPRINT chassis — technical drafting board"). Migration
       * deferred — block is stable, low churn. New docks SHOULD inline
       * their full chrome CSS in this slot. */
    `,

    /* ── nodes — see chassis.css [data-dock="blueprint"] .mother-frame ── */
    nodes: `
      /* Node-palette CSS lives in src/renderer/styles/chassis.css under
       *   [data-dock="blueprint"] .mother-frame
       * Migration deferred. New docks SHOULD inline their full per-node
       * palette + bezel CSS in this slot. */
    `,

    /* ── toolbar — drafting-tab strip with ink chips ───────────────────── */
    toolbar: `
      /* Inset matches the drafting title-block padding; the toolbar reads
       * as a labelled tab pinned to the top of the sheet. */
      .dock-chassis.dock-blueprint {
        --station-toolbar-margin: 4px 14px 0;
      }
      .dock-chassis.dock-blueprint [data-testid="station-toolbar"] {
        background: rgba(255, 255, 255, 0.18) !important;
        border: 1px solid var(--bp-line-2) !important;
        border-radius: 2px;
        position: relative;
        z-index: 2;
      }
      html[data-theme="dark"] .dock-chassis.dock-blueprint [data-testid="station-toolbar"] {
        background: rgba(126, 200, 227, 0.06) !important;
      }
      .dock-chassis.dock-blueprint [data-testid="station-toolbar"] > span {
        color: var(--bp-ink-2) !important;
      }
      .dock-chassis.dock-blueprint [data-testid="station-toolbar"] button {
        color: var(--bp-ink-2) !important;
        background: transparent !important;
        border-color: transparent !important;
      }
      .dock-chassis.dock-blueprint [data-testid="station-toolbar"] button[aria-pressed="true"] {
        color: var(--bp-ink) !important;
        background: rgba(94, 125, 29, 0.10) !important;
        border-color: var(--bp-line-2) !important;
      }
      html[data-theme="dark"] .dock-chassis.dock-blueprint [data-testid="station-toolbar"] button[aria-pressed="true"] {
        background: rgba(126, 200, 227, 0.12) !important;
        border-color: rgba(126, 200, 227, 0.32) !important;
      }
      .dock-chassis.dock-blueprint [data-testid="station-toolbar"] button:hover {
        background: rgba(94, 125, 29, 0.06) !important;
      }
      html[data-theme="dark"] .dock-chassis.dock-blueprint [data-testid="station-toolbar"] button:hover {
        background: rgba(126, 200, 227, 0.06) !important;
      }
    `,
  },
);
