// What's new after a feature update (launch-experience.md F5–F7) — draft A,
// "editorial": the picture on the left, the three highlights on the right,
// click 01–03 to switch. Shown once per feature release; Help › What's new
// and `krnl whatsnew show` open it again.

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Z } from '../ui/layers';
import { closeWhatsNew, openFeedback, useLaunchStore } from '../../launch/launchStore';
import { focusNode } from '../../store/scheduleActions';
import { useBoardStore } from '../../store/boardStore';
import { RELEASES_URL } from '../../../shared/update';
import type { WhatsNewArt, WhatsNewItem } from '../../../shared/whatsnew';
import artMini from '../../assets/launch/plate-mini.webp';
import artMenubar from '../../assets/launch/plate-menubar.webp';
import artFeedback from '../../assets/launch/plate-feedback.webp';
import artStreak from '../../assets/launch/plate-streak.webp';
import artSessions from '../../assets/launch/plate-sessions.webp';
import artGuide from '../../assets/launch/plate-guide.webp';
import artBoard from '../../assets/launch/plate-board.webp';
import { startTour } from '../Tour/TourHost';

const ART: Record<WhatsNewArt, string> = {
  mini: artMini, menubar: artMenubar, feedback: artFeedback, streak: artStreak, sessions: artSessions, guide: artGuide, board: artBoard,
};

function runAction(item: WhatsNewItem): void {
  if (item.action === 'feedback') {
    closeWhatsNew(false);
    openFeedback('idea');
    return;
  }
  closeWhatsNew();
  if (item.action === 'pomo') {
    const pomo = useBoardStore.getState().board?.nodes.find((n) => n.kind === 'pomo' && n.isMother);
    if (pomo) focusNode(pomo.id);
  }
  if (item.action === 'settings') window.dispatchEvent(new CustomEvent('krnl:open-settings'));
  if (item.action === 'tour') window.setTimeout(() => startTour('first-day'), 200);
}

export function WhatsNewDialog() {
  const release = useLaunchStore((s) => s.whatsNew);
  const info = useLaunchStore((s) => s.info);
  const [step, setStep] = useState(0);

  useEffect(() => { setStep(0); }, [release]);
  useEffect(() => {
    if (!release) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeWhatsNew();
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') setStep((s) => Math.min(s + 1, release.items.length - 1));
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') setStep((s) => Math.max(s - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [release]);

  if (!release || release.items.length === 0) return null;
  const item = release.items[Math.min(step, release.items.length - 1)]!;
  const last = step >= release.items.length - 1;
  const from = info?.previousVersion && info.kind === 'feature' ? `Updated · ${info.previousVersion} → ${info.version}` : `New in ${release.minor}`;

  return createPortal(
    <div className="ln-scrim" style={{ zIndex: Z.modal }} onClick={() => closeWhatsNew()} data-testid="whatsnew">
      <div className="ln-dialog ln-wn" role="dialog" aria-modal="true" aria-labelledby="ln-wn-title" onClick={(e) => e.stopPropagation()}>
        <div className="ln-wn__art ln-dots">
          <img key={item.art} src={ART[item.art]} alt="" />
          <div className="ln-wn__cap">
            <span className="ln-label">{item.kicker}</span>
            <span className="ln-body">{item.caption}</span>
          </div>
        </div>
        <div className="ln-wn__main">
          <div className="ln-row">
            <span className="ln-chip" data-testid="whatsnew-chip">{from}</span>
            <span className="ln-meta" style={{ marginLeft: 'auto' }}>{step + 1} of {release.items.length}</span>
          </div>
          <h2 id="ln-wn-title" className="ln-display" style={{ marginTop: 24, fontSize: 46 }}>{item.title}</h2>
          <p className="ln-body" style={{ marginTop: 16, maxWidth: 400 }}>{item.body}</p>
          <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {release.items.map((it, i) => (
              <button key={it.label} type="button" className="ln-step" aria-pressed={i === step} onClick={() => setStep(i)} data-testid={`whatsnew-step-${i}`}>
                <span className="ln-step__num">{String(i + 1).padStart(2, '0')}</span>
                <span style={{ fontSize: 13 }}>{it.label}</span>
              </button>
            ))}
          </div>
          <div className="ln-row" style={{ marginTop: 'auto', gap: 8 }}>
            <button type="button" className="ln-link" onClick={() => { void window.krnl?.appOpenExternal?.(RELEASES_URL); }}>full release notes</button>
            <span style={{ flex: 1 }} />
            <button type="button" className="ln-btn" onClick={() => closeWhatsNew()} data-testid="whatsnew-later">Later</button>
            {item.action !== 'none' && (
              <button type="button" className="ln-btn ln-btn--line" onClick={() => runAction(item)} data-testid="whatsnew-show">Show me</button>
            )}
            <button
              type="button"
              className="ln-btn ln-btn--primary"
              data-testid="whatsnew-next"
              onClick={() => (last ? closeWhatsNew() : setStep(step + 1))}
            >
              {last ? 'Done' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
