// Small inline line icons for places that used text glyphs (▶ ★ ☆ ♪ ▸ ◆).
// Text glyphs render in the OS symbol font, ignore the app's stroke weight and
// sit off the baseline; these follow currentColor and sit inline with text.

const PATHS = {
  play: <path d="M8 5.5v13l10-6.5z" fill="currentColor" stroke="none" />,
  star: <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z" fill="currentColor" />,
  starOutline: <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z" />,
  note: <><circle cx="8" cy="17" r="2.5" /><path d="M10.5 17V5l8-1.5V15" /><circle cx="16" cy="15" r="2.5" /></>,
  chevron: <path d="M9 6l6 6-6 6" />,
  diamond: <path d="M12 4l7 8-7 8-7-8z" fill="currentColor" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  close: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  dot: <circle cx="12" cy="12" r="4.5" fill="currentColor" stroke="none" />,
} as const;

export type LineGlyphName = keyof typeof PATHS;

export function LineGlyph({ name, size = 11, weight = 2 }: { name: LineGlyphName; size?: number; weight?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={weight}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ display: 'inline-block', verticalAlign: '-0.12em', flexShrink: 0 }}
    >
      {PATHS[name]}
    </svg>
  );
}
