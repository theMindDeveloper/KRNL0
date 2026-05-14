// MotdBanner — React-rendered MOTD that sits above the xterm body.
//
// Rationale: writing the MOTD as ANSI bytes to xterm is fragile on Windows.
// PowerShell + PSReadLine emit screen-clearing escape sequences during
// initialization, which wipe any banner the renderer pre-wrote. Rendering
// the banner as React keeps it outside the shell's reach: PowerShell can
// clear xterm all it wants, the banner stays.
//
// Layout: positioned between `.term-head` and `.term-body`, full width,
// dark background to match the terminal. Auto-collapses to a one-line
// compact form when the container is too short for the multi-line logo.

import { useEffect, useRef, useState } from 'react';

const LOGO_LINES = [
  '██╗  ██╗██████╗ ███╗   ██╗██╗      ██████╗ ',
  '██║ ██╔╝██╔══██╗████╗  ██║██║     ██╔═████╗',
  '█████╔╝ ██████╔╝██╔██╗ ██║██║     ██║██╔██║',
  '██╔═██╗ ██╔══██╗██║╚██╗██║██║     ████╔╝██║',
  '██║  ██╗██║  ██║██║ ╚████║███████╗╚██████╔╝',
  '╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝╚══════╝ ╚═════╝ ',
];

const ACID = '#c9f158';
const DIM = '#6b6657';

export interface MotdBannerProps {
  version: string;
  sessionId: string | null;
  /** Bound observed height of the parent terminal body in px. */
  bodyHeightPx?: number;
}

/**
 * Renders the KRNL0 logo, version tagline, and help hint above the xterm.
 * Falls back to a single-line compact form if the body height is small.
 */
export function MotdBanner({ version, sessionId, bodyHeightPx }: MotdBannerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setContainerWidth(w);
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const sid8 = sessionId ? sessionId.slice(0, 8) : '';
  // Heuristic: logo is ~44 chars wide at 9px monospace ≈ 240px. Below that,
  // or when the body is short, compact. Default to compact until measured.
  const compact = containerWidth > 0 && containerWidth < 260
    || (bodyHeightPx !== undefined && bodyHeightPx < 180);

  if (compact) {
    return (
      <div
        ref={ref}
        style={{
          background: 'var(--term-bg, #05040a)',
          color: ACID,
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10,
          padding: '6px 12px 6px',
          borderBottom: '1px solid #2a241c',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          letterSpacing: '0.02em',
        }}
      >
        krnl0 v{version} · type <span style={{ color: '#fff' }}>'krnl help'</span>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      style={{
        background: 'var(--term-bg, #05040a)',
        padding: '8px 12px 6px',
        borderBottom: '1px solid #2a241c',
        overflow: 'hidden',
      }}
    >
      <pre
        style={{
          color: ACID,
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 9,
          lineHeight: 1.05,
          margin: 0,
          fontWeight: 600,
          letterSpacing: 0,
          whiteSpace: 'pre',
          overflow: 'hidden',
        }}
      >
        {LOGO_LINES.join('\n')}
      </pre>
      <div
        style={{
          color: ACID,
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10,
          marginTop: 4,
          letterSpacing: '0.02em',
        }}
      >
        krnl0 · v{version} · claude code attached
        {sid8 && <span style={{ color: DIM }}> · session {sid8}</span>}
      </div>
      <div
        style={{
          color: DIM,
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10,
          marginTop: 2,
          letterSpacing: '0.02em',
        }}
      >
        type a command — try <span style={{ color: '#dcd6c6' }}>'krnl help'</span>
      </div>
    </div>
  );
}
