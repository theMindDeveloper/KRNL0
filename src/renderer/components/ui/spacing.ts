// Spacing rule for popups and small panels (docs/04-visual-system — "Spacing").
// One rhythm everywhere so sections never sit cramped against each other:
//   - panel padding 14 × 16
//   - 12 px between sections (header, times, task, actions)
//   - 8 px between items inside a row
//   - 6 px between a caption and its control
// Use these instead of ad-hoc margins.

export const SPACE = {
  /** Popup / panel padding. */
  panelPad: '14px 16px',
  /** Between sections of a popup. */
  section: 12,
  /** Between items in one row. */
  inline: 8,
  /** Caption → control. */
  caption: 6,
} as const;

/** A popup's content column: sections separated by SPACE.section. */
export const popupColumn: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: SPACE.section,
};
