// TerminalNode visual constants — extracted for testability.
// F1: Header label and badge text.
// F2: Boot lines written to xterm on session start.

/** Label shown in the header centre — matches LifeOS Whiteboard ref `.term-head .label` */
export const HEADER_LABEL = 'claude-code · ~/krnl0 · zsh';

/** LIVE badge text shown in the header right — matches `.term-head .badge` */
export const LIVE_BADGE_TEXT = 'LIVE';

/** Acid-coloured boot line (F2) */
export const BOOT_LINE_ASCII =
  '\x1b[38;2;201;241;88m▙ krnl0 · v0.2.0 · claude code attached · tmux session "main"\x1b[0m\r\n';

/** Dim separator line (F2) */
export const BOOT_LINE_SEPARATOR =
  '\x1b[2m─────────────────────────────────────────────\x1b[0m\r\n';

/** Both boot lines in order */
export const BOOT_LINES: readonly string[] = [BOOT_LINE_ASCII, BOOT_LINE_SEPARATOR] as const;
