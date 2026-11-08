// A small flag before a plan's name in the DAY line / Month cell: this is the
// plan's deadline, not when it happens (its block is on another day).
export function DueFlag() {
  return (
    <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-label="due" style={{ marginRight: 4, verticalAlign: '-1px', flexShrink: 0 }}>
      <path d="M3 11V1.5M3 2h6.5l-1.5 2.5L9.5 7H3" />
    </svg>
  );
}
