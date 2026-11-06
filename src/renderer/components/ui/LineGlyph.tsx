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
} as const;

export type LineGlyphName = keyof typeof PATHS;

export function LineGlyph({ name, size = 11 }: { name: LineGlyphName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ display: 'inline-block', verticalAlign: '-0.12em', flexShrink: 0 }}
    >
      {PATHS[name]}
    </svg>
  );
}
