/**
 * Commander — glass-morphism popup for collecting session details.
 *
 * Visual treatment matches the orb chat panel: liquid gradient border, blur
 * backdrop, acid green accent. Three inputs (label / tasks / start time).
 * On submit, fires `onLaunch` with the params for sessionFromCommanderFlow.
 */

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { voicePlayer } from './VoicePlayer';

interface CommanderProps {
  onClose: () => void;
  onLaunch: (params: { label: string; tasks: string; startISO?: string }) => void;
}

export function Commander({ onClose, onLaunch }: CommanderProps) {
  const [label, setLabel]       = useState('');
  const [tasks, setTasks]       = useState('');
  const [startISO, setStartISO] = useState('');
  const labelRef = useRef<HTMLInputElement | null>(null);

  // Focus first field + greeting clip on mount.
  useEffect(() => {
    labelRef.current?.focus();
    voicePlayer.play('cmd_open').catch(() => {});
  }, []);

  // Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const lineCount = tasks.split(/\r?\n/).filter((s) => s.trim().length > 0).length;
  const valid = label.trim().length > 0 && lineCount >= 1;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    onLaunch({
      label: label.trim(),
      tasks,
      ...(startISO.trim() ? { startISO: startISO.trim() } : {}),
    });
  };

  return (
    <div
      // Backdrop — soft fade, click to close.
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 300,
        background: 'rgba(0, 0, 0, 0.35)',
        backdropFilter: 'blur(2px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'ai-panel-in 0.2s ease',
      }}
    >
      {/* Popup — same gradient/glass treatment as orb chat panel */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 460,
          maxWidth: '90vw',
          background: 'rgba(14, 13, 11, 0.94)',
          backdropFilter: 'blur(18px) saturate(140%)',
          border: '1px solid rgba(201, 241, 88, 0.22)',
          borderRadius: 16,
          overflow: 'hidden',
          boxShadow: [
            '0 0 0 1px rgba(201, 241, 88, 0.08)',
            '0 24px 80px rgba(0, 0, 0, 0.6)',
            '0 0 100px rgba(201, 241, 88, 0.18)',
          ].join(', '),
          animation: 'ai-panel-in 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)',
          fontFamily: 'var(--font-mono)',
          color: '#d4cfc0',
        }}
      >
        {/* Liquid gradient header bar */}
        <div
          style={{
            height: 3,
            background: 'linear-gradient(90deg, transparent 0%, var(--acid) 30%, var(--acid-glow) 50%, var(--acid) 70%, transparent 100%)',
            opacity: 0.7,
          }}
        />

        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid rgba(201, 241, 88, 0.15)',
            fontSize: 10.5,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--ink-3)',
          }}
        >
          <span>
            <span style={{ color: 'var(--acid)', marginRight: 8, textShadow: '0 0 8px var(--acid-glow)' }}>
              ▸
            </span>
            commander · new session
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent', border: 0,
              color: 'var(--ink-3)', cursor: 'pointer',
              fontSize: 18, lineHeight: 1, padding: 0,
              width: 22, height: 22,
            }}
            aria-label="Close commander"
          >
            ×
          </button>
        </div>

        <form onSubmit={onSubmit} style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Session label */}
          <Field label="SESSION LABEL">
            <input
              ref={labelRef}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. morning routine"
              autoComplete="off"
              spellCheck={false}
              style={inputStyle}
            />
          </Field>

          {/* Tasks list */}
          <Field
            label="TASKS"
            hint={`${lineCount}/5 — one per line, in order`}
          >
            <textarea
              value={tasks}
              onChange={(e) => setTasks(e.target.value)}
              placeholder={'review notes\nwrite the draft\nsend it'}
              rows={5}
              spellCheck={false}
              style={{ ...inputStyle, resize: 'vertical', minHeight: 96, lineHeight: 1.55 }}
            />
          </Field>

          {/* Start time */}
          <Field
            label="START (OPTIONAL)"
            hint="ISO local — leave empty for now+5min"
          >
            <input
              value={startISO}
              onChange={(e) => setStartISO(e.target.value)}
              placeholder="2026-05-15T10:00"
              autoComplete="off"
              spellCheck={false}
              style={inputStyle}
            />
          </Field>

          {/* Submit row */}
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button
              type="button"
              onClick={onClose}
              style={{ ...btnStyle, color: 'var(--ink-3)', borderColor: 'rgba(201,241,88,0.15)' }}
            >
              cancel
            </button>
            <button
              type="submit"
              disabled={!valid}
              style={{
                ...btnStyle,
                flex: 1,
                color: valid ? 'var(--acid)' : 'var(--ink-4)',
                borderColor: valid ? 'rgba(201,241,88,0.5)' : 'rgba(201,241,88,0.15)',
                background: valid ? 'rgba(201,241,88,0.08)' : 'transparent',
                cursor: valid ? 'pointer' : 'not-allowed',
                textShadow: valid ? '0 0 6px rgba(201,241,88,0.4)' : 'none',
              }}
            >
              › launch session
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Subcomponents / styles ──────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'rgba(0, 0, 0, 0.3)',
  border: '1px solid rgba(201, 241, 88, 0.15)',
  borderRadius: 6,
  color: '#d4cfc0',
  fontFamily: 'inherit',
  fontSize: 12.5,
  padding: '8px 10px',
  outline: 'none',
  transition: 'border-color 0.15s, background 0.15s',
};

const btnStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid',
  borderRadius: 6,
  padding: '8px 14px',
  fontFamily: 'var(--font-mono)',
  fontSize: 11.5,
  letterSpacing: '0.06em',
  textTransform: 'lowercase',
  transition: 'background 0.15s, color 0.15s, border-color 0.15s',
};

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        fontSize: 9.5, letterSpacing: '0.12em', color: 'var(--ink-4)',
      }}>
        <span>{label}</span>
        {hint && <span style={{ color: 'var(--ink-4)', textTransform: 'lowercase' }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}
