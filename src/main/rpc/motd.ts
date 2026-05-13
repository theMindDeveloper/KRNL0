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
}

/**
 * Render the MOTD banner as a string ready to write to the PTY.
 * T5: cols < 50 → compact single-line form.
 * T2–T4: otherwise multi-line logo + tagline + separator + prompt hint.
 */
export function renderMotd({ version, sessionId, cols }: MotdOptions): string {
  const sid8 = sessionId.slice(0, 8);

  if (cols < 50) {
    // T5: compact one-liner
    return `${ACID}krnl0 v${version} · 'help' for usage${RESET}\r\n`;
  }

  const tagline = `krnl0 · v${version} · claude code attached · session ${sid8}`;
  const separator = '─'.repeat(Math.min(cols - 2, 60));
  const hint = `type a command — try 'help' or 'krnl help'`;

  const parts: string[] = [];

  // T2: acid-green logo
  for (const line of LOGO_LINES) {
    parts.push(`${ACID}${line}${RESET}\r\n`);
  }

  // T3: tagline
  parts.push(`${ACID}  ${tagline}${RESET}\r\n`);

  // T4: dim separator
  parts.push(`${DIM}  ${separator}${RESET}\r\n`);

  // T4: prompt hint
  parts.push(`${DIM}  ${hint}${RESET}\r\n`);

  // blank line before shell prompt
  parts.push('\r\n');

  return parts.join('');
}
