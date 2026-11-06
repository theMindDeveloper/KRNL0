// Send feedback (launch-experience.md F16–F19).
//
// Builds a GitHub "new issue" link with the report filled in. Nothing is sent
// from the app: the user's browser opens the issue form and they post it
// themselves. No token ever ships inside the app. Pure, shared by the dialog
// and `krnl feedback`.

export const REPO_URL = 'https://github.com/theMindDeveloper/KRNL0';
export const ISSUES_NEW_URL = `${REPO_URL}/issues/new`;
/** For people without a GitHub account: the report goes by email instead. */
export const FEEDBACK_EMAIL = 'theminddevlab@gmail.com';

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
/**
 * Links the app may open in the browser: the project's own GitHub pages and a
 * mail to the feedback address. Matched by parsed host and path — a plain
 * prefix check would also pass "…/KRNL0-something" or "github.com.evil".
 */
export function isAllowedExternalUrl(url: unknown): url is string {
  if (typeof url !== 'string' || url.length > 8192) return false;
  if (url.startsWith(`mailto:${FEEDBACK_EMAIL}?`) || url === `mailto:${FEEDBACK_EMAIL}`) return true;
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== 'https:' || u.hostname !== 'github.com' || u.username || u.password || u.port) return false;
  const repo = '/theMindDeveloper/KRNL0';
  return u.pathname === repo || u.pathname.startsWith(`${repo}/`);
}

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

/** Mail clients cut long mailto links; keep the whole link under this. */
export const MAX_MAILTO_LENGTH = 1900;

/**
 * The same report as an email to the maintainer (no GitHub account needed).
 * Opens the user's mail app with it filled in; they press Send themselves.
 */
export function buildMailto(r: FeedbackReport): string {
  const kind = FEEDBACK_KINDS.find((k) => k.id === r.kind) ?? FEEDBACK_KINDS[0]!;
  const subject = `KRNL0 ${kind.prefix}: ${r.title.trim() || 'Feedback from the app'}`;
  const make = (rep: FeedbackReport): string =>
    `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(issueBody(rep).replace('_Sent from KRNL0 › Help › Send feedback._', 'Sent from KRNL0 › Help › Send feedback.'))}`;
  let rep = r;
  let url = make(rep);
  while (url.length > MAX_MAILTO_LENGTH && rep.diagnostics && rep.includeErrors && rep.diagnostics.errors.length > 0) {
    rep = { ...rep, diagnostics: { ...rep.diagnostics, errors: rep.diagnostics.errors.slice(1) } };
    url = make(rep);
  }
  while (url.length > MAX_MAILTO_LENGTH && rep.text.length > 120) {
    rep = { ...rep, text: `${rep.text.slice(0, Math.floor(rep.text.length * 0.8))}… (shortened)` };
    url = make(rep);
  }
  return url;
}
