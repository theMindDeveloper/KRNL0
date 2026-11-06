// Help menu (launch-experience.md F16): the "?" in the top bar. What's new,
// the tour, Send feedback, diagnostics, updates, the backups folder and the
// source on GitHub.

import { useRef, useState } from 'react';
import { Popover } from '../ui/Popover';
import { startTour } from '../Tour/TourHost';
import { openFeedback, openWelcomeBack, openWhatsNew, showMilestone, todayYMD, useLaunchStore } from '../../launch/launchStore';
import { shareCardFor } from '../../launch/milestones';
import { useBoardStore } from '../../store/boardStore';
import { latestNotes } from '../../../shared/whatsnew';
import { REPO_URL, diagnosticsText } from '../../../shared/feedback';
import { checkForUpdates } from '../../store/updateStore';
import { currentDiagnostics } from './FeedbackDialog';

const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';

export function HelpMenu() {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const anchor = useRef<HTMLButtonElement>(null);
  const version = useLaunchStore((s) => s.info?.version) ?? APP_VERSION;
  const notes = latestNotes();

  const run = (fn: () => void) => () => { setOpen(false); setNote(null); fn(); };
  // Your longest habit streak as a card; the focus-sessions card without habits.
  const shareCard = (): void => {
    const nodes = useBoardStore.getState().board?.nodes ?? [];
    const streak = shareCardFor(nodes, todayYMD(), { kind: 'streak' });
    const card = streak && streak.value > 0 ? streak : shareCardFor(nodes, todayYMD(), { kind: 'sessions' });
    if (card) showMilestone(card);
  };
  const copyDiagnostics = (): void => {
    void navigator.clipboard.writeText(diagnosticsText(currentDiagnostics())).then(() => setNote('Diagnostics copied'));
  };

  return (
    <>
      <button
        ref={anchor}
        type="button"
        data-testid="topbar-help"
        className="krnl-topbar-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Help"
        onClick={() => setOpen((v) => !v)}
        style={{
          background: 'transparent', border: '1px solid var(--paper-3)', borderRadius: 'var(--radius)', padding: '4px 10px',
          cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-3)', letterSpacing: '0.04em',
          WebkitAppRegion: 'no-drag',
        } as React.CSSProperties}
      >
        ?
      </button>
      <Popover anchor={anchor.current} open={open} onClose={() => setOpen(false)} minWidth={272}>
        <div className="ln-menu" role="menu" aria-label="Help" data-testid="help-menu">
          {notes && (
            <button type="button" role="menuitem" className="ln-menu__item" onClick={run(() => openWhatsNew(notes))} data-testid="help-whatsnew">
              <span>What&apos;s new in {notes.minor}</span><span />
            </button>
          )}
          <button type="button" role="menuitem" className="ln-menu__item" onClick={run(() => { startTour('welcome'); })}>
            <span>Take the tour</span><span />
          </button>
          <button type="button" role="menuitem" className="ln-menu__item" onClick={run(() => { openWelcomeBack(true, null); })} data-testid="help-catchup">
            <span>Catch up</span><span>what slipped</span>
          </button>
          <button type="button" role="menuitem" className="ln-menu__item" onClick={run(shareCard)} data-testid="help-share">
            <span>Share a milestone</span><span>streak card</span>
          </button>
          <div className="ln-menu__rule" />
          <button type="button" role="menuitem" className="ln-menu__item" onClick={run(() => openFeedback('bug'))} data-testid="help-feedback">
            <span>Send feedback</span><span>bug, idea</span>
          </button>
          <button type="button" role="menuitem" className="ln-menu__item" onClick={() => { copyDiagnostics(); }}>
            <span>{note ?? 'Copy diagnostics'}</span><span>version, errors</span>
          </button>
          <button type="button" role="menuitem" className="ln-menu__item" onClick={run(() => { void window.krnl?.appOpenExternal?.(REPO_URL); })}>
            <span>Source on GitHub</span><span>↗</span>
          </button>
          <div className="ln-menu__rule" />
          <button type="button" role="menuitem" className="ln-menu__item" onClick={run(() => { void checkForUpdates(); window.dispatchEvent(new CustomEvent('krnl:open-settings')); })}>
            <span>Check for updates</span><span />
          </button>
          <button type="button" role="menuitem" className="ln-menu__item" onClick={run(() => { void window.krnl?.appBackupsOpen?.(); })}>
            <span>Board backups</span><span>folder</span>
          </button>
          <div className="ln-menu__rule" />
          <div className="ln-menu__item" style={{ cursor: 'default' }} aria-disabled>
            <span style={{ color: 'var(--ink-3)' }}>KRNL0 {version}</span><span>krnl feedback</span>
          </div>
        </div>
      </Popover>
    </>
  );
}
