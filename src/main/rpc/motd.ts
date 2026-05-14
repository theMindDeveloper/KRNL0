// MOTD banner renderer — T1–T5.
// Called from main process; the result is sent as pty:data before the shell
// prompt so the user sees it immediately on terminal mount.
// No React, no xterm — pure string construction.

const ACID = '\x1b[38;2;201;241;88m';
const DIM   = '\x1b[2m';
const RESET = '\x1b[0m';

// ADR §6.2 multi-line ASCII art logo
const LOGO_LINES = [
  '  ██╗  ██╗██████╗ ███╗   ██╗██╗      ██████╗ ',
  '  ██║ ██╔╝██╔══██╗████╗  ██║██║     ██╔═████╗',
  '  █████╔╝ ██████╔╝██╔██╗ ██║██║     ██║██╔██║',
  '  ██╔═██╗ ██╔══██╗██║╚██╗██║██║     ████╔╝██║',
  '  ██║  ██╗██║  ██║██║ ╚████║███████╗╚██████╔╝',
  '  ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝╚══════╝ ╚═════╝ ',
];

export interface MotdOptions {
  version: string;
  sessionId: string;
  cols: number;
  /**
   * Optional viewport height. When < 14 we fall back to the compact form so
   * the multi-line banner doesn't immediately scroll into scrollback before
   * the shell prompt arrives. Defaults to a large value (skip the check) when
   * the caller doesn't know the row count yet.
   */
  rows?: number;
}

/**
 * Render the MOTD banner as a string ready to write to the PTY.
 * T5: cols < 50 OR rows < 14 → compact single-line form.
 * T2–T4: otherwise multi-line logo + tagline + hint.
 */
export function renderMotd({ version, sessionId, cols, rows = 1000 }: MotdOptions): string {
  const sid8 = sessionId.slice(0, 8);

  if (cols < 50 || rows < 14) {
    // T5: compact one-liner — fits any reasonable viewport
    return `${ACID}krnl0 v${version} · type 'krnl help'${RESET}\r\n`;
  }

  const tagline = `krnl0 · v${version} · claude code attached · session ${sid8}`;
  const hint = `type a command — try 'krnl help'`;

  const parts: string[] = [];

  // T2: acid-green logo (6 rows)
  for (const line of LOGO_LINES) {
    parts.push(`${ACID}${line}${RESET}\r\n`);
  }

  // T3: tagline (truncated if it would wrap)
  const taglineLine = tagline.length > cols - 2 ? `krnl0 · v${version}` : tagline;
  parts.push(`${ACID}  ${taglineLine}${RESET}\r\n`);

  // T4: dim hint (no separator — saves a row + always fits)
  parts.push(`${DIM}  ${hint}${RESET}\r\n`);

  // blank line before shell prompt
  parts.push('\r\n');

  return parts.join('');
}
