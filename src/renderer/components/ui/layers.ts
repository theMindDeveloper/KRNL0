// Stacking order for everything that floats above the canvas. One list, so a
// new overlay picks a named layer instead of guessing a number. Higher wins.
// Backdrops (the click-outside catchers) sit one below their surface.
//
// chassis.css `.dock-style-picker-flyout` uses 10000 (= Z.topmost).

export const Z = {
  /** Top bar, status bar, canvas hover buttons. */
  chrome: 100,
  /** Orb chat, ambient radio — viewport-fixed widgets. */
  widget: 200,
  /** Small blocking dialogs (habit swap). */
  dialog: 250,
  /** Commander palette. */
  commander: 300,
  /** Canvas node right-click menu. */
  nodeMenu: 1000,
  /** Task / block popups opened from a node, and their backdrop. */
  popupBackdrop: 1998,
  popup: 1999,
  /** Calendar overlapping-layer chooser, and its backdrop. */
  layerMenuBackdrop: 2098,
  layerMenu: 2099,
  /** Transient notices pinned to the bottom of the window. */
  notice: 2100,
  /** Pie menu / pen wheel, and their backdrop. */
  radialBackdrop: 3000,
  radial: 3001,
  /** Full-window modals (Settings). */
  modal: 4000,
  /** Guided-tour spotlight and card — above modals (a tour step can point
   *  into Settings), below dropdowns the user opens while following it. */
  tourBackdrop: 4050,
  /** The tour card sits above the click-catchers of open cards (so Next and
   *  Skip work while a plan card is open) and below the cards themselves. */
  tour: 4097,
  /** Dropdowns and pickers — always above whatever opened them, modals included. */
  /** Click-outside catcher of a card or dropdown: under the tour card. */
  popoverBackdrop: 4090,
  popover: 4100,
  /** Generic right-click menus (habit, tag picker, list rows). */
  contextMenu: 9999,
  /** Inline quick-add bar on the canvas. */
  topmost: 10000,
} as const;
