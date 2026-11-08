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
import { SoundSection } from './SoundSection';
import { FinishedSection } from './FinishedSection';
import { Switch } from '../ui/Switch';
import { SettingsIcon, type SettingsIconName } from '../ui/SettingsIcons';

export type Theme = 'light' | 'dark';
export type SettingsSection = 'general' | 'timer' | 'sounds' | 'finished' | 'celebrations' | 'updates' | 'reset';

const SECTIONS: ReadonlyArray<{ id: SettingsSection; icon: SettingsIconName; label: string; title: string; blurb: string }> = [
  { id: 'general', icon: 'general', label: 'General', title: 'General', blurb: 'How KRNL0 looks, and how much of it you see.' },
  { id: 'timer', icon: 'timer', label: 'Floating timer', title: 'Floating timer', blurb: 'Keep the Pomo in sight while you work in other apps.' },
  { id: 'sounds', icon: 'sound', label: 'Sounds', title: 'Sounds', blurb: 'Small sounds that confirm what you just did.' },
  { id: 'finished', icon: 'finished', label: 'Finished cards', title: 'Finished cards', blurb: 'Done tasks clear off the board so today stays in focus.' },
  { id: 'celebrations', icon: 'celebrations', label: 'Celebrations', title: 'Celebrations', blurb: 'A card to keep or share when you hit a milestone.' },
  { id: 'updates', icon: 'updates', label: 'Updates', title: 'Updates & backups', blurb: 'New versions arrive by themselves. Your board is copied first.' },
  { id: 'reset', icon: 'reset', label: 'Reset', title: 'Start over', blurb: 'Wipe the board and begin from the default workspace.' },
];

/** Which section holds a Settings element (tours open Settings on the right page). */
const TARGET_SECTION: ReadonlyArray<[string, SettingsSection]> = [
  ['settings-sound', 'sounds'], ['settings-finished', 'finished'], ['settings-show-finished', 'finished'],
  ['settings-pocket', 'timer'], ['settings-celebrations', 'celebrations'], ['settings-updates', 'updates'],
  ['settings-backups', 'updates'], ['settings-factory-reset', 'reset'], ['settings-theme', 'general'],
  ['settings-mode', 'general'], ['Easy or Advanced', 'general'], ['Light or dark', 'general'],
];

export function settingsSectionFor(selector: string | undefined): SettingsSection {
  if (!selector) return 'general';
  return TARGET_SECTION.find(([key]) => selector.includes(key))?.[1] ?? 'general';
}

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
  const easyMode = useEasyMode();

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
          <div className="st-nav__title"><SettingsIcon name="settings" />Settings</div>
          {/* easy-mode D25 — Finished cards (how done cards clear off the canvas) is Advanced. */}
          {SECTIONS.filter((s) => !(easyMode && s.id === 'finished')).map((s) => (
            <button
              key={s.id}
              type="button"
              className="st-nav__item"
              aria-current={s.id === section ? 'page' : undefined}
              onClick={() => setSection(s.id)}
              data-testid={`settings-tab-${s.id}`}
            >
              <span className="st-nav__icon" aria-hidden><SettingsIcon name={s.icon} /></span>
              <span>{s.label}</span>
            </button>
          ))}
        </nav>

        <div className="st-main">
          <header className="st-head">
            <span className="st-head__icon" aria-hidden><SettingsIcon name={meta.icon} size={22} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 className="st-head__title">{meta.title}</h2>
              <p className="st-head__blurb">{meta.blurb}</p>
            </div>
            <CloseButton testId="settings-close" label="Close settings" onClick={onClose} />
          </header>
          <div className="st-body">
            {section === 'general' && <General theme={theme} onTheme={onTheme} />}
            {section === 'timer' && <Card><PocketSection /></Card>}
            {section === 'sounds' && <SoundSection />}
            {section === 'finished' && <FinishedSection />}
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

function Card({ title, icon, children }: { title?: string; icon?: SettingsIconName; children: ReactNode }) {
  return (
    <section className="st-card">
      {title && <h3 className="st-card__title">{icon && <SettingsIcon name={icon} size={15} />}{title}</h3>}
      {children}
    </section>
  );
}

function General({ theme, onTheme }: { theme: Theme; onTheme: (t: Theme) => void }) {
  const setUiMode = useBoardStore((s) => s.setUiMode);
  const alignGrid = useBoardStore((s) => s.board?.alignGrid ?? null);
  const setAlignGrid = useBoardStore((s) => s.setAlignGrid);
  const easy = useEasyMode();
  return (
    <>
      <Card title="Appearance" icon="appearance">
        <div role="radiogroup" aria-label="Light or dark" className="st-choices">
          {(['light', 'dark'] as const).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={theme === t} data-testid={`settings-theme-${t}`} onClick={() => onTheme(t)} className="st-choice">
              <span className={`st-swatch st-swatch--${t}`} aria-hidden>
                <i /><i /><i />
              </span>
              <span className="st-choice__label"><SettingsIcon name={t === 'light' ? 'sun' : 'moon'} size={15} />{t === 'light' ? 'Light' : 'Dark'}</span>
            </button>
          ))}
        </div>
      </Card>
      {/* Easy / Advanced — Easy hides the links between features; data is the same. */}
      <Card title="Mode" icon="mode">
        <div role="radiogroup" aria-label="Easy or Advanced" className="st-choices">
          {([
            ['easy', 'Easy', 'Plan your day and see where the time went'],
            ['advanced', 'Advanced', 'Connect tasks, categories and focus'],
          ] as const).map(([m, label, hint]) => {
            const on = (m === 'easy') === easy;
            return (
              <button key={m} type="button" role="radio" aria-checked={on} data-testid={`settings-mode-${m}`} onClick={() => setUiMode(m)} className="st-choice st-choice--text">
                <span className="st-choice__label"><SettingsIcon name={m} size={15} />{label}</span>
                <span className="st-choice__hint">{hint}</span>
              </button>
            );
          })}
        </div>
      </Card>
      <Card title="Canvas" icon="box">
        <div className="st-row">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="st-row__title">Align to grid</div>
            <div className="st-row__hint">
              What you move settles into neat positions, never on top of each other. Turning it on tidies the canvas once.
            </div>
          </div>
          <Switch checked={alignGrid !== null} onChange={(on) => setAlignGrid(on ? 'cards' : null)} testId="settings-align-grid" title="Align to grid" />
        </div>
        {alignGrid !== null && (
          <div role="radiogroup" aria-label="What aligns to the grid" className="st-choices" style={{ marginTop: 12 }}>
            {([
              ['cards', 'Cards only', 'Plan, habit and event cards'],
              ['all', 'Everything', 'Also notes, shapes, images and frames'],
            ] as const).map(([v, label, hint]) => (
              <button key={v} type="button" role="radio" aria-checked={alignGrid === v} data-testid={`settings-align-grid-${v}`} onClick={() => setAlignGrid(v)} className="st-choice st-choice--text">
                <span className="st-choice__label">{label}</span>
                <span className="st-choice__hint">{hint}</span>
              </button>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

function Reset({ onClose }: { onClose: () => void }) {
  const factoryReset = useBoardStore((s) => s.factoryReset);
  return (
    <section className="st-card st-card--danger">
      <h3 className="st-card__title" style={{ color: 'var(--rust)' }}><SettingsIcon name="warning" size={15} />Factory reset</h3>
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
