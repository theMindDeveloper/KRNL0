/**
 * Tweaks panel — right-side slide-in panel for global design + per-node config.
 * Wires to selectedNodeId from boardStore to show node-specific options.
 */

import { useState } from 'react';
import { useBoardStore } from '../../store/boardStore';
import { makeCommandHandler } from '../Canvas/commandDispatch';

type Vibe = 'default' | 'paper' | 'noir' | 'solar';
type Density = 'default' | 'compact' | 'spacious';

type PomoVariant = 'vapor' | 'ring' | 'ascii' | 'lcd' | 'blocks';

const VIBES: Array<{ value: Vibe; label: string }> = [
  { value: 'default', label: 'default' },
  { value: 'paper',   label: 'paper' },
  { value: 'noir',    label: 'noir' },
  { value: 'solar',   label: 'solar' },
];

const DENSITIES: Array<{ value: Density; label: string }> = [
  { value: 'compact',  label: 'compact' },
  { value: 'default',  label: 'default' },
  { value: 'spacious', label: 'spacious' },
];

const POMO_VARIANTS: Array<{ value: PomoVariant; label: string }> = [
  { value: 'vapor',  label: 'vapor' },
  { value: 'ring',   label: 'ring' },
  { value: 'ascii',  label: 'ascii' },
  { value: 'lcd',    label: 'lcd' },
  { value: 'blocks', label: 'blocks' },
];

function applyVibe(vibe: Vibe) {
  document.documentElement.setAttribute('data-vibe', vibe === 'default' ? '' : vibe);
}

function applyDensity(density: Density) {
  document.documentElement.setAttribute('data-density', density === 'default' ? '' : density);
}

function TweakRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ fontSize: 10, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {children}
      </div>
    </div>
  );
}

interface TweakOptProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

function TweakOpt({ label, active, onClick }: TweakOptProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        minWidth: 0,
        background: active ? 'var(--ink)' : 'var(--paper)',
        border: `1px solid ${active ? 'var(--ink)' : 'var(--paper-3)'}`,
        color: active ? 'var(--acid)' : 'var(--ink-2)',
        padding: '5px 8px',
        fontFamily: 'var(--font-mono)',
        fontSize: 10.5,
        borderRadius: 4,
        cursor: 'pointer',
        textTransform: 'lowercase',
        transition: 'all 0.1s ease',
      }}
    >
      {label}
    </button>
  );
}

interface TweaksProps {
  open: boolean;
  onClose: () => void;
}

export function Tweaks({ open, onClose }: TweaksProps) {
  const [vibe, setVibe] = useState<Vibe>('default');
  const [density, setDensity] = useState<Density>('default');

  const selectedNodeId = useBoardStore((s) => s.selectedNodeId);
  const board = useBoardStore((s) => s.board);

  const selectedNode = selectedNodeId
    ? board?.nodes.find((n) => n.id === selectedNodeId)
    : null;

  const handleVibe = (v: Vibe) => {
    setVibe(v);
    applyVibe(v);
  };

  const handleDensity = (d: Density) => {
    setDensity(d);
    applyDensity(d);
  };

  if (!open) return null;

  // Per-node config section
  let nodeConfigSection: React.ReactNode = null;
  if (selectedNode) {
    const dispatch = makeCommandHandler(selectedNode.id);
    switch (selectedNode.kind) {
      case 'pomo': {
        const currentVariant = (selectedNode.config as { variant?: PomoVariant } | null)?.variant ?? 'vapor';
        nodeConfigSection = (
          <TweakRow label="Pomo variant">
            {POMO_VARIANTS.map(({ value, label }) => (
              <TweakOpt
                key={value}
                label={label}
                active={currentVariant === value}
                onClick={() => dispatch('node.setConfig', { patch: { variant: value } })}
              />
            ))}
          </TweakRow>
        );
        break;
      }
      case 'calendar': {
        const currentFirstDay = (selectedNode.config as { firstDay?: 0 | 1 } | null)?.firstDay ?? 1;
        nodeConfigSection = (
          <TweakRow label="First day of week">
            <TweakOpt label="Monday" active={currentFirstDay === 1} onClick={() => dispatch('node.setConfig', { patch: { firstDay: 1 } })} />
            <TweakOpt label="Sunday" active={currentFirstDay === 0} onClick={() => dispatch('node.setConfig', { patch: { firstDay: 0 } })} />
          </TweakRow>
        );
        break;
      }
      case 'text': {
        const currentFontSize = (selectedNode.state as { fontSize?: number } | null)?.fontSize ?? 18;
        nodeConfigSection = (
          <TweakRow label="Font size">
            {[14, 16, 18, 22, 28].map((size) => (
              <TweakOpt
                key={size}
                label={String(size)}
                active={currentFontSize === size}
                onClick={() => dispatch('text.setContent', { content: (selectedNode.state as { content?: string })?.content ?? '' })}
              />
            ))}
          </TweakRow>
        );
        break;
      }
      default: {
        nodeConfigSection = (
          <div style={{ fontSize: 11, color: 'var(--ink-4)', fontStyle: 'italic' }}>
            No config options for this node.
          </div>
        );
      }
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        right: 0,
        top: 48,
        width: 260,
        background: 'rgba(253, 250, 242, 0.96)',
        backdropFilter: 'blur(12px)',
        border: '1px solid var(--paper-3)',
        borderRadius: '8px 0 0 8px',
        boxShadow: 'var(--shadow-2)',
        zIndex: 50,
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '10px 12px',
        borderBottom: '1px solid var(--paper-2)',
        display: 'flex',
        alignItems: 'center',
        fontSize: 10.5,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: 'var(--ink-3)',
      }}>
        <span>Tweaks</span>
        <button
          type="button"
          onClick={onClose}
          style={{
            marginLeft: 'auto',
            cursor: 'pointer',
            color: 'var(--ink-3)',
            background: 'none',
            border: 'none',
            fontSize: 14,
            padding: 0,
          }}
        >
          ×
        </button>
      </div>

      {/* Body */}
      <div style={{ padding: '10px 12px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Global: Design vibe */}
        <TweakRow label="Design vibe">
          {VIBES.map(({ value, label }) => (
            <TweakOpt key={value} label={label} active={vibe === value} onClick={() => handleVibe(value)} />
          ))}
        </TweakRow>

        {/* Global: Density */}
        <TweakRow label="Density">
          {DENSITIES.map(({ value, label }) => (
            <TweakOpt key={value} label={label} active={density === value} onClick={() => handleDensity(value)} />
          ))}
        </TweakRow>

        {/* Node config section */}
        {selectedNode && (
          <>
            <div style={{ height: 1, background: 'var(--paper-3)', margin: '2px 0' }} />
            <div style={{ fontSize: 10, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {selectedNode.kind} · config
            </div>
            {nodeConfigSection}
          </>
        )}
      </div>
    </div>
  );
}
