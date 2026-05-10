import { useOrbStore } from '../../store/useOrbStore';
import { OrbHistory } from './OrbHistory';
import { OrbSuggestions } from './OrbSuggestions';
import { OrbForm } from './OrbForm';

export function OrbPanel() {
  const panelOpen = useOrbStore((s) => s.panelOpen);
  const togglePanel = useOrbStore((s) => s.togglePanel);
  const clearMessages = useOrbStore((s) => s.clearMessages);

  if (!panelOpen) return null;

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        bottom: 80,
        width: 340,
        maxHeight: 480,
        background: 'rgba(14, 13, 11, 0.94)',
        backdropFilter: 'blur(18px) saturate(140%)',
        border: '1px solid rgba(201, 241, 88, 0.22)',
        borderRadius: 14,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 0 0 1px rgba(201, 241, 88, 0.08), 0 20px 60px rgba(0, 0, 0, 0.6), 0 0 80px rgba(201, 241, 88, 0.15)',
        animation: 'ai-panel-in 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)',
        color: 'var(--ink)',
        fontFamily: 'var(--font-mono)',
        zIndex: 300,
      }}
    >
      <style>{`
        @keyframes ai-panel-in {
          from { opacity: 0; transform: translateY(10px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>

      {/* Panel header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 14px',
        borderBottom: '1px solid rgba(201, 241, 88, 0.15)',
        fontSize: 10.5,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: 'var(--ink-3)',
      }}>
        <span>
          <span style={{ color: 'var(--acid)', marginRight: 8, textShadow: '0 0 8px var(--acid-glow)' }}>◆</span>
          krnl · ai
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={clearMessages}
            style={{ background: 'transparent', border: 0, color: 'var(--ink-3)', fontSize: 10.5, cursor: 'pointer', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '0 4px' }}
          >
            clear
          </button>
          <button
            type="button"
            onClick={togglePanel}
            style={{ background: 'transparent', border: 0, color: 'var(--ink-3)', fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}
          >
            ×
          </button>
        </div>
      </div>

      {/* Message history */}
      <OrbHistory />

      {/* Suggestions */}
      <OrbSuggestions />

      {/* Input form */}
      <OrbForm />
    </div>
  );
}
