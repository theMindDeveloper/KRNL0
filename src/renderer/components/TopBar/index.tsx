export function TopBar() {
  const handleThemeToggle = () => {
    const current = document.documentElement.getAttribute('data-theme');
    if (current === 'dark') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  };

  return (
    <div
      style={{
        height: 44,
        background: 'var(--paper-2)',
        borderBottom: '1px solid var(--paper-3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        flexShrink: 0,
        zIndex: 100,
      }}
    >
      {/* Brand mark */}
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 12.5,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: 'var(--acid)',
          userSelect: 'none',
        }}
      >
        ▙ KRNL0
      </span>

      {/* Theme toggle */}
      <button
        type="button"
        onClick={handleThemeToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'transparent',
          border: '1px solid var(--paper-3)',
          borderRadius: 'var(--radius)',
          padding: '4px 10px',
          cursor: 'pointer',
          fontFamily: 'var(--font-mono)',
          fontSize: 10.5,
          color: 'var(--ink-3)',
          letterSpacing: '0.04em',
        }}
        aria-label="Toggle theme"
      >
        <span>theme</span>
        <span style={{ color: 'var(--ink-4)', fontSize: 10 }}>⌘K</span>
      </button>
    </div>
  );
}
