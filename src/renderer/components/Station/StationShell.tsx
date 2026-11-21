// Shared pieces of both Station presets (Decision 54).

/** Thin wrapper that sizes a station cell to fill its panel. Transparent so
 *  the dock chrome's themed background shows between cards. */
export function CellWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: 'transparent',
        padding: 'var(--k-cell-gap, 3px)',
        boxSizing: 'border-box',
      }}
    >
      {children}
    </div>
  );
}

export function EmptyShellHint() {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--ink-3)',
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        opacity: 0.6,
      }}
    >
      every panel is hidden — toggle one back on
    </div>
  );
}
