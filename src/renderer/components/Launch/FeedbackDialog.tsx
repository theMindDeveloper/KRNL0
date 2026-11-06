// Send feedback (launch-experience.md F16–F18). A short form that opens a
// filled-in GitHub issue in the browser. Nothing is sent from the app: the
// user reads it on GitHub and posts it. The board, tasks and notes are never
// added — only the version, the system and (if ticked) recent errors.

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Z } from '../ui/layers';
import { CloseButton } from '../ui/CloseButton';
import { Switch } from '../ui/Switch';
import { closeFeedback, useLaunchStore } from '../../launch/launchStore';
import { useEventLog } from '../../store/eventLog';
import {
  FEEDBACK_KINDS,
  buildIssueUrl,
  diagnosticsText,
  type Diagnostics,
  type FeedbackKind,
} from '../../../shared/feedback';

const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';

/** The last 20 warnings and errors from the event log, oldest first. */
export function recentErrors(): string[] {
  return useEventLog.getState().entries
    .filter((e) => e.severity === 'err' || e.severity === 'warn')
    .slice(-20)
    .map((e) => `${new Date(e.ts).toISOString().slice(11, 19)} ${e.text}`.slice(0, 240));
}

export function currentDiagnostics(): Diagnostics {
  const info = useLaunchStore.getState().info;
  return { version: info?.version ?? APP_VERSION, os: info?.system ?? navigator.platform, errors: recentErrors() };
}

export function FeedbackDialog() {
  const preset = useLaunchStore((s) => s.feedback);
  const [kind, setKind] = useState<FeedbackKind>('bug');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [withSystem, setWithSystem] = useState(true);
  const [withErrors, setWithErrors] = useState(true);
  const [showErrors, setShowErrors] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!preset) return;
    setKind(preset.kind);
    setTitle(preset.title);
    setText('');
    setCopied(false);
    setShowErrors(false);
  }, [preset]);

  useEffect(() => {
    if (!preset) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeFeedback(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [preset]);

  const diagnostics = useMemo(() => (preset ? currentDiagnostics() : null), [preset]);
  if (!preset || !diagnostics) return null;

  const placeholder = kind === 'bug'
    ? 'What happened, and what did you expect?'
    : kind === 'idea' ? 'What would you like KRNL0 to do?' : kind === 'question' ? 'What would you like to know?' : 'What do you like about it?';

  const send = (): void => {
    const url = buildIssueUrl({ kind, title, text, diagnostics: withSystem ? diagnostics : null, includeErrors: withErrors });
    void window.krnl?.appOpenExternal?.(url);
    closeFeedback();
  };
  const copy = (): void => {
    void navigator.clipboard.writeText(diagnosticsText(diagnostics)).then(() => setCopied(true));
  };

  return createPortal(
    <div className="ln-scrim" style={{ zIndex: Z.modal }} onClick={closeFeedback} data-testid="feedback-dialog">
      <div className="ln-dialog" role="dialog" aria-modal="true" aria-labelledby="ln-fb-title" onClick={(e) => e.stopPropagation()}
        style={{ width: 560, display: 'flex', flexDirection: 'column' }}>
        <div className="ln-row" style={{ padding: '24px 24px 0' }}>
          <h2 id="ln-fb-title" style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Send feedback</h2>
          <span className="ln-meta">· goes straight to the person who builds KRNL0</span>
          <span style={{ flex: 1 }} />
          <CloseButton onClick={closeFeedback} label="Close" />
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', minHeight: 0 }}>
          <div className="ln-field">
            <span className="ln-label">What is it?</span>
            <div className="ln-seg" role="group" aria-label="Kind of feedback">
              {FEEDBACK_KINDS.map((k) => (
                <button key={k.id} type="button" aria-pressed={kind === k.id} onClick={() => setKind(k.id)} data-testid={`feedback-kind-${k.id}`}>{k.label}</button>
              ))}
            </div>
          </div>
          <label className="ln-field">
            <span className="ln-label">Short title</span>
            <input className="ln-input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="e.g. Week view misses Sunday" data-testid="feedback-title" autoFocus />
          </label>
          <label className="ln-field">
            <span className="ln-label">{placeholder}</span>
            <textarea className="ln-input" value={text} onChange={(e) => setText(e.target.value)} rows={5} data-testid="feedback-text" />
          </label>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span className="ln-label">Added so it can be fixed faster</span>
            <div className="ln-row" style={{ minHeight: 48 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5 }}>App version and system</div>
                <div className="ln-meta">KRNL0 {diagnostics.version} · {diagnostics.os}</div>
              </div>
              <Switch checked={withSystem} onChange={setWithSystem} title="App version and system" />
            </div>
            <div className="ln-row" style={{ minHeight: 48, opacity: withSystem ? 1 : 0.5 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5 }}>Recent errors</div>
                <div className="ln-meta">
                  {diagnostics.errors.length === 0 ? 'none in this session' : `last ${diagnostics.errors.length} lines of the event log · `}
                  {diagnostics.errors.length > 0 && (
                    <button type="button" className="ln-link" onClick={() => setShowErrors((v) => !v)}>{showErrors ? 'hide' : 'view'}</button>
                  )}
                </div>
              </div>
              <Switch checked={withErrors && withSystem} onChange={setWithErrors} title="Recent errors" />
            </div>
            {showErrors && <pre className="ln-pre">{diagnostics.errors.join('\n')}</pre>}
            <span className="ln-meta" style={{ marginTop: 8 }}>Your board, tasks and notes are never added.</span>
          </div>
        </div>

        <div className="ln-row" style={{ padding: '16px 24px 24px', gap: 8, boxShadow: 'inset 0 1px 0 var(--paper-3)' }}>
          <span className="ln-meta" style={{ flex: 1, minWidth: 0 }}>Opens a filled-in GitHub issue. Nothing is sent until you post it.</span>
          <button type="button" className="ln-btn ln-btn--sm" onClick={copy} data-testid="feedback-copy">{copied ? 'Copied' : 'Copy diagnostics'}</button>
          <button type="button" className="ln-btn ln-btn--sm ln-btn--primary" onClick={send} data-testid="feedback-send">Continue on GitHub</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
