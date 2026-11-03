/**
 * Commander — glass-morphism popup for collecting session details.
 *
 * Visual treatment matches the orb chat panel: liquid gradient border, blur
 * backdrop, acid green accent. Three inputs (label / tasks / start time).
 * On submit, fires `onLaunch` with the params for sessionFromCommanderFlow.
 */

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { voicePlayer } from './VoicePlayer';
import { CloseButton } from '../ui/CloseButton';
import { Z } from '../ui/layers';
import { normalizeStartInput } from '../../../shared/scheduleAt';

export const MAX_COMMANDER_TASKS = 5;

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
  const tooMany = lineCount > MAX_COMMANDER_TASKS;
  // Checked here, before launch: a bad time used to run the whole flow and
  // only fail inside the terminal.
  const start = startISO.trim() ? normalizeStartInput(startISO) : null;
  const badStart = startISO.trim().length > 0 && start === null;
  const valid = label.trim().length > 0 && lineCount >= 1 && !tooMany && !badStart;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    onLaunch({
      label: label.trim(),
      tasks,
      ...(start ? { startISO: start } : {}),
    });
  };

  return (
    <div
      // Backdrop — soft fade, click to close.
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: Z.commander,
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
        role="dialog"
        aria-modal="true"
        aria-label="Commander — new session"
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
            background: 'linear-gradient(90deg, transparent 0%, var(--accent-on-dark) 30%, var(--accent-on-dark) 50%, var(--accent-on-dark) 70%, transparent 100%)',
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
            color: '#8a8270',
          }}
        >
          <span>
            <span style={{ color: 'var(--accent-on-dark)', marginRight: 8, textShadow: '0 0 8px var(--accent-on-dark)' }}>
              ▸
            </span>
            commander · new session
          </span>
          <CloseButton tone="dark" label="Close commander" onClick={onClose} />
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
            hint={tooMany
              ? `${lineCount}/${MAX_COMMANDER_TASKS} — too many, remove ${lineCount - MAX_COMMANDER_TASKS}`
              : `${lineCount}/${MAX_COMMANDER_TASKS} — one per line, in order`}
            warn={tooMany}
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
            hint={badStart ? 'not a time — use 10:00 or 2026-05-15T10:00' : 'HH:MM today or YYYY-MM-DDTHH:MM — empty = in 5 min'}
            warn={badStart}
          >
            <input
              value={startISO}
              aria-invalid={badStart}
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
              style={{ ...btnStyle, color: '#8a8270', borderColor: 'rgba(201,241,88,0.15)' }}
            >
              cancel
            </button>
            <button
              type="submit"
              disabled={!valid}
              style={{
                ...btnStyle,
                flex: 1,
                color: valid ? 'var(--accent-on-dark)' : '#6b6354',
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

function Field({ label, hint, warn = false, children }: { label: string; hint?: string; warn?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        fontSize: 9.5, letterSpacing: '0.12em', color: '#6b6354',
      }}>
        <span>{label}</span>
        {/* The panel is always dark: the terminal's palette reads on it in every theme. */}
        {hint && <span style={{ color: warn ? 'var(--term-rust)' : 'var(--term-dim)', textTransform: 'lowercase' }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}
