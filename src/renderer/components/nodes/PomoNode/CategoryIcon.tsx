// Line icons for the built-in tag categories (ADR 0016), drawn in the tag's
// colour. Custom categories fall back to a filled dot.

const PATHS: Record<string, string> = {
  code: 'M8 6l-6 6 6 6M16 6l6 6-6 6',
  study: 'M2 9l10-5 10 5-10 5zM6 11v5c3 2 9 2 12 0v-5',
  writing: 'M4 20l4-1 11-11-3-3L5 16z',
  reading: 'M3 5h7a2 2 0 012 2v12a2 2 0 00-2-2H3zM21 5h-7a2 2 0 00-2 2v12a2 2 0 012-2h7z',
  meetings: 'M9 11a3 3 0 100-6 3 3 0 000 6zM3 20c0-3 3-5 6-5s6 2 6 5M17 11a2.5 2.5 0 100-5M21 19c0-2-1.5-3.5-4-4',
  admin: 'M3 6h18v12H3zM3 7l9 6 9-6',
  planning: 'M4 6h16v14H4zM4 10h16M8 3v5M16 3v5',
  health: 'M3 12h4l2-4 4 8 2-4h6',
  chores: 'M3 11l9-7 9 7M5 10v10h14V10',
  social: 'M4 5h16v11H9l-5 4z',
  creative: 'M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z',
};

export function CategoryIcon({ id, color, size = 12 }: { id: string; color: string; size?: number }) {
  const d = PATHS[id];
  if (!d) {
    return <span aria-hidden style={{ width: size * 0.6, height: size * 0.6, borderRadius: 999, background: color, flexShrink: 0 }} />;
  }
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d={d} />
    </svg>
  );
}
