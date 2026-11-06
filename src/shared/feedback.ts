// Send feedback (launch-experience.md F16–F19).
//
// Builds a GitHub "new issue" link with the report filled in. Nothing is sent
// from the app: the user's browser opens the issue form and they post it
// themselves. No token ever ships inside the app. Pure, shared by the dialog
// and `krnl feedback`.

export const REPO_URL = 'https://github.com/theMindDeveloper/KRNL0';
export const ISSUES_NEW_URL = `${REPO_URL}/issues/new`;

export type FeedbackKind = 'bug' | 'idea' | 'question' | 'love';

export const FEEDBACK_KINDS: ReadonlyArray<{ id: FeedbackKind; label: string; prefix: string; githubLabel: string }> = [
  { id: 'bug', label: 'Something’s broken', prefix: 'Bug', githubLabel: 'bug' },
  { id: 'idea', label: 'An idea', prefix: 'Idea', githubLabel: 'enhancement' },
  { id: 'question', label: 'A question', prefix: 'Question', githubLabel: 'question' },
  { id: 'love', label: 'Something I love', prefix: 'Love', githubLabel: 'feedback' },
];

export function isFeedbackKind(v: unknown): v is FeedbackKind {
  return v === 'bug' || v === 'idea' || v === 'question' || v === 'love';
}

export interface Diagnostics {
  version: string;
  os: string;
  /** Recent warnings and errors, newest last. */
  errors: string[];
}

/** The block pasted into a report (and copied by "Copy diagnostics"). */
export function diagnosticsText(d: Diagnostics): string {
  const lines = [`KRNL0 ${d.version} · ${d.os}`];
  if (d.errors.length > 0) {
    lines.push('', 'Recent errors:', ...d.errors.map((e) => `- ${e}`));
  }
  return lines.join('\n');
}

export interface FeedbackReport {
  kind: FeedbackKind;
  title: string;
  text: string;
  /** Null when the user unticked "app version and system". */
  diagnostics: Diagnostics | null;
  /** Include the recent errors (only when diagnostics are on). */
  includeErrors: boolean;
}

/** Long links get cut by browsers and GitHub; keep the encoded URL under this. */
export const MAX_URL_LENGTH = 7500;

export function issueBody(r: FeedbackReport): string {
  const parts = [r.text.trim() || '_No description._'];
  if (r.diagnostics) {
    const d = r.includeErrors ? r.diagnostics : { ...r.diagnostics, errors: [] };
    parts.push('', '---', '```', diagnosticsText(d), '```');
  }
  parts.push('', '_Sent from KRNL0 › Help › Send feedback._');
  return parts.join('\n');
}

/**
 * The prefilled GitHub link. When it would be too long, the oldest error lines
 * are dropped first, then the description is shortened, so the link still opens.
 */
export function buildIssueUrl(r: FeedbackReport): string {
  const kind = FEEDBACK_KINDS.find((k) => k.id === r.kind) ?? FEEDBACK_KINDS[0]!;
  const title = `${kind.prefix}: ${r.title.trim() || 'Feedback from the app'}`;
  const make = (rep: FeedbackReport): string => {
    const q = new URLSearchParams({ title, body: issueBody(rep), labels: kind.githubLabel });
    return `${ISSUES_NEW_URL}?${q.toString()}`;
  };
  let rep = r;
  let url = make(rep);
  while (url.length > MAX_URL_LENGTH && rep.diagnostics && rep.includeErrors && rep.diagnostics.errors.length > 0) {
    rep = { ...rep, diagnostics: { ...rep.diagnostics, errors: rep.diagnostics.errors.slice(1) } };
    url = make(rep);
  }
  while (url.length > MAX_URL_LENGTH && rep.text.length > 200) {
    rep = { ...rep, text: `${rep.text.slice(0, Math.floor(rep.text.length * 0.8))}… (shortened)` };
    url = make(rep);
  }
  return url;
}
