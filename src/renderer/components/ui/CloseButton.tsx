// CloseButton — the one ✕ for dialogs, popups and panels: same glyph, size,
// hit area and hover everywhere (it used to be ×, ✕ or an SVG at 11–18 px).
// `tone="dark"` is for panels that are dark in every theme (Orb, Commander).

import type { CSSProperties } from 'react';

interface Props {
  onClick: () => void;
  label?: string;
  testId?: string;
  title?: string;
  tone?: 'theme' | 'dark';
  style?: CSSProperties;
}

export function CloseButton({ onClick, label = 'Close', testId, title, tone = 'theme', style }: Props) {
  const colors = tone === 'dark'
    ? { '--close-c': '#8a8270', '--close-c-hover': '#d4cfc0' }
    : { '--close-c': 'var(--ink-3)', '--close-c-hover': 'var(--ink)' };
  return (
    <button
      type="button"
      className="krnl-close-btn"
      aria-label={label}
      title={title ?? label}
      data-testid={testId}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onMouseDown={(e) => e.stopPropagation()}
      style={{ ...(colors as CSSProperties), ...style }}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
        <path d="M2 2l8 8M10 2l-8 8" />
      </svg>
    </button>
  );
}
