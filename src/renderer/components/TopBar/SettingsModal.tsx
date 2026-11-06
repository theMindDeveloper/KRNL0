// Settings — one window, a section list on the left and the section on the
// right. Opens on General (the guided tour points at Mode there). Help ›
// Check for updates opens it on Updates.

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { HoldButton } from '../ui/HoldButton';
import { CloseButton } from '../ui/CloseButton';
import { Z } from '../ui/layers';
import { useEasyMode } from '../../store/uiMode';
import { useBoardStore } from '../../store/boardStore';
import { UpdatesSection } from './UpdatesSection';
import { PocketSection } from './PocketSection';
import { BackupsSection, CelebrationsSection } from './LaunchSettings';

export type Theme = 'light' | 'dark';
export type SettingsSection = 'general' | 'timer' | 'celebrations' | 'updates' | 'reset';

const SECTIONS: ReadonlyArray<{ id: SettingsSection; emoji: string; label: string; title: string; blurb: string }> = [
  { id: 'general', emoji: '✨', label: 'General', title: 'General', blurb: 'How KRNL0 looks, and how much of it you see.' },
  { id: 'timer', emoji: '⏱️', label: 'Floating timer', title: 'Floating timer', blurb: 'Keep the Pomo in sight while you work in other apps.' },
  { id: 'celebrations', emoji: '🎉', label: 'Celebrations', title: 'Celebrations', blurb: 'A card to keep or share when you hit a milestone.' },
  { id: 'updates', emoji: '🔄', label: 'Updates', title: 'Updates & backups', blurb: 'New versions arrive by themselves. Your board is copied first.' },
  { id: 'reset', emoji: '🧨', label: 'Reset', title: 'Start over', blurb: 'Wipe the board and begin from the default workspace.' },
];

export function SettingsModal({ onClose, theme, onTheme, initial = 'general' }: {
  onClose: () => void; theme: Theme; onTheme: (t: Theme) => void; initial?: SettingsSection;
}) {
  const [section, setSection] = useState<SettingsSection>(initial);
  useEffect(() => { setSection(initial); }, [initial]);

  // Escape closes, like every other dialog — unless a dropdown inside handles it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if ((e.target as HTMLElement | null)?.closest?.('[data-own-escape]')) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const meta = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0]!;

  return createPortal(
    <div
      data-testid="settings-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      onClick={onClose}
      className="ln-scrim"
      style={{ zIndex: Z.modal } as React.CSSProperties}
    >
      <div className="ln-dialog st" onClick={(e) => e.stopPropagation()}>
        <nav className="st-nav" aria-label="Settings sections">
          <div className="st-nav__title">⚙️ Settings</div>
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              className="st-nav__item"
              aria-current={s.id === section ? 'page' : undefined}
              onClick={() => setSection(s.id)}
              data-testid={`settings-tab-${s.id}`}
            >
              <span className="st-nav__emoji" aria-hidden>{s.emoji}</span>
              <span>{s.label}</span>
            </button>
          ))}
        </nav>

        <div className="st-main">
          <header className="st-head">
            <span className="st-head__emoji" aria-hidden>{meta.emoji}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 className="st-head__title">{meta.title}</h2>
              <p className="st-head__blurb">{meta.blurb}</p>
            </div>
            <CloseButton testId="settings-close" label="Close settings" onClick={onClose} />
          </header>
          <div className="st-body">
            {section === 'general' && <General theme={theme} onTheme={onTheme} />}
            {section === 'timer' && <Card><PocketSection /></Card>}
            {section === 'celebrations' && <Card><CelebrationsSection /></Card>}
            {section === 'updates' && (
              <>
                <Card><UpdatesSection /></Card>
                <Card><BackupsSection /></Card>
              </>
            )}
            {section === 'reset' && <Reset onClose={onClose} />}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Card({ title, emoji, children }: { title?: string; emoji?: string; children: ReactNode }) {
  return (
    <section className="st-card">
      {title && <h3 className="st-card__title"><span aria-hidden>{emoji}</span>{title}</h3>}
      {children}
    </section>
  );
}

function General({ theme, onTheme }: { theme: Theme; onTheme: (t: Theme) => void }) {
  const setUiMode = useBoardStore((s) => s.setUiMode);
  const easy = useEasyMode();
  return (
    <>
      <Card title="Appearance" emoji="🎨">
        <div role="radiogroup" aria-label="Light or dark" className="st-choices">
          {(['light', 'dark'] as const).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={theme === t} data-testid={`settings-theme-${t}`} onClick={() => onTheme(t)} className="st-choice">
              <span className={`st-swatch st-swatch--${t}`} aria-hidden>
                <i /><i /><i />
              </span>
              <span className="st-choice__label">{t === 'light' ? '☀️ Light' : '🌙 Dark'}</span>
            </button>
          ))}
        </div>
      </Card>
      {/* Easy / Advanced — Easy hides the links between features; data is the same. */}
      <Card title="Mode" emoji="🧭">
        <div role="radiogroup" aria-label="Easy or Advanced" className="st-choices">
          {([
            ['easy', '🌱 Easy', 'Plan your day and see where the time went'],
            ['advanced', '🛠️ Advanced', 'Connect tasks, categories and focus'],
          ] as const).map(([m, label, hint]) => {
            const on = (m === 'easy') === easy;
            return (
              <button key={m} type="button" role="radio" aria-checked={on} data-testid={`settings-mode-${m}`} onClick={() => setUiMode(m)} className="st-choice st-choice--text">
                <span className="st-choice__label">{label}</span>
                <span className="st-choice__hint">{hint}</span>
              </button>
            );
          })}
        </div>
      </Card>
    </>
  );
}

function Reset({ onClose }: { onClose: () => void }) {
  const factoryReset = useBoardStore((s) => s.factoryReset);
  return (
    <section className="st-card st-card--danger">
      <h3 className="st-card__title" style={{ color: 'var(--rust)' }}><span aria-hidden>⚠️</span>Factory reset</h3>
      <p className="st-text">
        Deletes the current board — all tasks, habits, schedules, history and layout — and starts fresh from the
        default workspace. This cannot be undone. A copy from before the last update stays in Updates › Board backups.
      </p>
      <HoldButton
        testId="settings-factory-reset"
        label="Reset everything"
        holdingLabel="Hold to reset…"
        onConfirm={() => {
          void factoryReset();
          onClose();
        }}
        style={{ width: '100%' }}
      />
    </section>
  );
}
