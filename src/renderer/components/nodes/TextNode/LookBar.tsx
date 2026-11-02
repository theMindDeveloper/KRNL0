// Style bar shown above a selected text node: switch between note, sticky
// and shapes, and pick a colour. Miro-style brainstorming.

import type { TextLook, TextLookKind } from './types';
import { STICKY_COLORS } from './types';

const SHAPE_ICONS: Record<TextLookKind, React.ReactNode> = {
  note: (<><path d="M5 5h14v14H5z" strokeDasharray="3 2.5" /></>),
  sticky: (<><path d="M5 4h14v11l-5 5H5z" /><path d="M14 20v-5h5" /></>),
  rect: (<rect x="4" y="6" width="16" height="12" rx="2" />),
  ellipse: (<ellipse cx="12" cy="12" rx="8.5" ry="6.5" />),
  diamond: (<path d="M12 3.5l8.5 8.5-8.5 8.5L3.5 12z" />),
};
const LABEL: Record<TextLookKind, string> = { note: 'Note', sticky: 'Sticky note', rect: 'Rectangle', ellipse: 'Ellipse', diamond: 'Diamond' };

export function LookBar({ look, onChange }: { look: TextLook; onChange: (next: Partial<TextLook>) => void }) {
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <div
      className="nodrag"
      data-testid="text-look-bar"
      onMouseDown={stop}
      onPointerDown={stop}
      onClick={stop}
      style={{
        position: 'absolute', left: '50%', bottom: '100%', transform: 'translate(-50%, -10px)', zIndex: 10,
        display: 'flex', alignItems: 'center', gap: 2, padding: 4, borderRadius: 10,
        background: 'var(--paper-2)', border: '1px solid var(--paper-3)', boxShadow: '0 8px 22px rgba(0,0,0,0.35)',
        whiteSpace: 'nowrap',
      }}
    >
      {(Object.keys(SHAPE_ICONS) as TextLookKind[]).map((k) => {
        const on = look.kind === k;
        return (
          <button key={k} type="button" aria-label={LABEL[k]} title={LABEL[k]} data-testid={`text-look-${k}`}
            onClick={() => onChange({ kind: k })}
            style={{
              width: 28, height: 28, display: 'grid', placeItems: 'center', padding: 0, border: 'none', borderRadius: 7, cursor: 'pointer',
              background: on ? 'var(--acid)' : 'transparent', color: on ? 'var(--ink-on-bright, #111)' : 'var(--ink-2)',
            }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden>{SHAPE_ICONS[k]}</svg>
          </button>
        );
      })}
      {look.kind !== 'note' && (
        <>
          <span aria-hidden style={{ width: 1, alignSelf: 'stretch', background: 'var(--paper-3)', margin: '2px 4px' }} />
          {STICKY_COLORS.map((c) => (
            <button key={c} type="button" aria-label={`Colour ${c}`} title={c}
              onClick={() => onChange({ color: c })}
              style={{
                width: 22, height: 22, margin: 3, padding: 0, borderRadius: 999, cursor: 'pointer', background: c,
                border: 'none', boxShadow: look.color === c ? `0 0 0 2px var(--paper-2), 0 0 0 4px ${c}` : 'inset 0 0 0 1px rgba(0,0,0,0.15)',
              }} />
          ))}
        </>
      )}
    </div>
  );
}
