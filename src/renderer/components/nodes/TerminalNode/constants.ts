// TerminalNode visual constants — extracted for testability.
// F1: Header label and badge text.

/** Label shown in the header centre — matches LifeOS Whiteboard ref `.term-head .label` */
export const HEADER_LABEL = 'claude-code · ~/krnl0 · zsh';

/** LIVE badge text shown in the header right — matches `.term-head .badge` */
export const LIVE_BADGE_TEXT = 'LIVE';

/** Window event that clears a terminal's screen (`krnl term clear`). detail: { nodeId } */
export const TERM_CLEAR_EVENT = 'krnl:term-clear';

/** Font sizes `term setFontSize` accepts. */
export const TERM_FONT_MIN = 8;
export const TERM_FONT_MAX = 32;
