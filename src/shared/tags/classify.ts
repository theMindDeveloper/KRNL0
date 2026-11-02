// Task tags — offline classifier (ADR 0016).
//
// Deterministic, dependency-free, no model call: the same text and history
// always produce the same tag, in the renderer and in the sys CLI alike.
//
// Score per tag = keyword evidence + learned evidence:
//   1. Keywords — each stemmed token that matches a tag keyword adds 1
//      (2 for a `strong` keyword). Custom tags use their label words as strong
//      keywords plus any keywords the user gave them.
//   2. Learning — every item the user tagged by hand is a training example.
//      Tokens seen in examples vote for that example's tag in proportion to
//      how exclusively they belong to it (a cheap naive-Bayes flavour), and a
//      near-duplicate of an example (Jaccard ≥ 0.6) gets a strong boost. So
//      re-tagging "standup notes" as Meetings once teaches it for next time.
// The best tag wins only if it clears MIN_SCORE; otherwise the task stays
// untagged ("Other") rather than being guessed.

import { BUILTIN_TAGS } from './taxonomy';
import type { TagDef } from './taxonomy';

export type { TagDef } from './taxonomy';
export { BUILTIN_TAGS } from './taxonomy';

/** A previously tagged task the classifier can learn from. */
export interface TagExample {
  text: string;
  tag: string;
}

export interface TagMatch {
  tagId: string;
  score: number;
}

const MIN_SCORE = 1;
const NEAR_DUP_JACCARD = 0.6;

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'to', 'for', 'of', 'on', 'in', 'at', 'with',
  'my', 'me', 'i', 'is', 'it', 'up', 'do', 'get', 'go', 'some', 'new', 'from',
  'about', 'into', 'by', 'this', 'that', 'be', 'all', 'more', 'min', 'mins', 'm',
]);

/** Light English stemmer — enough to fold plurals and -ing/-ed forms. */
export function stem(word: string): string {
  let w = word.toLowerCase().replace(/'s$/, '');
  // Plural first, so "meetings" and "meeting" reach the same -ing strip.
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 4 && /(ss|x|ch|sh)es$/.test(w)) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
  if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith('ed')) w = w.slice(0, -2);
  // running → runn → run, planning → plann → plan
  if (w.length > 3 && /([bcdfghjklmnpqrstvwz])\1$/.test(w)) w = w.slice(0, -1);
  return w;
}

/** Normalised, de-duplicated tokens of a task text. */
export function tokenize(text: string): string[] {
  const out = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^a-z0-9äöüß]+/)) {
    if (!raw || STOPWORDS.has(raw) || /^\d+$/.test(raw)) continue;
    out.add(stem(raw));
  }
  return [...out];
}

/** Stable id for a custom tag label: "Side project" → "side-project". */
export function slugifyTag(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9äöüß]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

/** Built-ins followed by the user's custom tags (custom ids never shadow a built-in). */
// Memoised on the custom array's identity so the keyword index below is built
// once per library revision, not once per classification.
const mergedCache = new WeakMap<readonly TagDef[], readonly TagDef[]>();
const BUILTIN_ONLY: readonly TagDef[] = [...BUILTIN_TAGS];

export function mergeTagLibrary(custom: readonly TagDef[] | undefined): readonly TagDef[] {
  if (!custom || custom.length === 0) return BUILTIN_ONLY;
  const hit = mergedCache.get(custom);
  if (hit) return hit;
  const ids = new Set(BUILTIN_TAGS.map((t) => t.id));
  const merged = [...BUILTIN_TAGS, ...custom.filter((t) => !ids.has(t.id))];
  mergedCache.set(custom, merged);
  return merged;
}

/** Resolve a raw tag reference (id or label, case-insensitive). */
export function findTag(library: readonly TagDef[], raw: string): TagDef | undefined {
  const needle = raw.trim().toLowerCase();
  if (!needle) return undefined;
  return (
    library.find((t) => t.id === needle) ??
    library.find((t) => t.label.toLowerCase() === needle) ??
    library.find((t) => t.id === slugifyTag(raw))
  );
}

/** Display info for any stored tag value — unknown legacy labels ("WORK") fall back to themselves. */
export function tagDisplay(library: readonly TagDef[], raw: string): { id: string; label: string; color: string } {
  const t = findTag(library, raw);
  if (t) return { id: t.id, label: t.label, color: t.color };
  return { id: raw, label: raw, color: 'var(--ink-3)' };
}

interface KeywordIndex {
  /** stemmed token → [tagId, weight][] */
  map: Map<string, Array<[string, number]>>;
}

const indexCache = new WeakMap<readonly TagDef[], KeywordIndex>();

function buildIndex(library: readonly TagDef[]): KeywordIndex {
  const cached = indexCache.get(library);
  if (cached) return cached;
  const map = new Map<string, Array<[string, number]>>();
  const add = (word: string, tagId: string, weight: number) => {
    for (const tok of tokenize(word)) {
      const list = map.get(tok) ?? [];
      const existing = list.find(([id]) => id === tagId);
      if (existing) existing[1] = Math.max(existing[1], weight);
      else list.push([tagId, weight]);
      map.set(tok, list);
    }
  };
  for (const t of library) {
    for (const k of t.keywords ?? []) add(k, t.id, 1);
    for (const k of t.strong ?? []) add(k, t.id, 2);
    if (!t.builtin) add(t.label, t.id, 2);
  }
  const index = { map };
  indexCache.set(library, index);
  return index;
}

function jaccard(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b);
  let inter = 0;
  for (const x of a) if (setB.has(x)) inter++;
  return inter / (a.length + b.length - inter);
}

/** Every tag with a positive score, best first. Ties keep library order. */
export function scoreTags(
  text: string,
  library: readonly TagDef[],
  examples: readonly TagExample[] = [],
): TagMatch[] {
  const tokens = tokenize(text);
  if (tokens.length === 0) return [];
  const known = new Set(library.map((t) => t.id));
  const scores = new Map<string, number>();
  const bump = (id: string, by: number) => {
    if (known.has(id)) scores.set(id, (scores.get(id) ?? 0) + by);
  };

  const { map } = buildIndex(library);
  for (const tok of tokens) {
    for (const [id, w] of map.get(tok) ?? []) bump(id, w);
  }

  if (examples.length > 0) {
    // token → tagId → count, over hand-tagged examples only.
    const learned = new Map<string, Map<string, number>>();
    const wanted = new Set(tokens);
    let bestDup: { id: string; sim: number } | null = null;
    for (const ex of examples) {
      const id = findTag(library, ex.tag)?.id;
      if (!id) continue;
      const exTokens = tokenize(ex.text);
      for (const tok of exTokens) {
        if (!wanted.has(tok)) continue;
        const per = learned.get(tok) ?? new Map<string, number>();
        per.set(id, (per.get(id) ?? 0) + 1);
        learned.set(tok, per);
      }
      const sim = jaccard(tokens, exTokens);
      if (sim >= NEAR_DUP_JACCARD && (!bestDup || sim > bestDup.sim)) bestDup = { id, sim };
    }
    for (const per of learned.values()) {
      let total = 0;
      for (const c of per.values()) total += c;
      for (const [id, c] of per) bump(id, 1.5 * (c / total));
    }
    if (bestDup) bump(bestDup.id, 3 * bestDup.sim);
  }

  const order = new Map(library.map((t, i) => [t.id, i]));
  return [...scores.entries()]
    .filter(([, s]) => s > 0)
    .map(([tagId, score]) => ({ tagId, score }))
    .sort((a, b) => b.score - a.score || (order.get(a.tagId)! - order.get(b.tagId)!));
}

/** The single best tag id, or null when nothing is confident enough. */
export function classifyTask(
  text: string,
  library: readonly TagDef[],
  examples: readonly TagExample[] = [],
): string | null {
  const best = scoreTags(text, library, examples)[0];
  return best && best.score >= MIN_SCORE ? best.tagId : null;
}
