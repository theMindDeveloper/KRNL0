// Letter names for plans that clash (calendar-clock-visuals.md F28): each slim
// bar is named by its first character. When two bars of one clash would share
// a letter, those add the first letter of their last word ("RA", "RB"), then
// more letters, then a number — never two bars with the same name.

/** The first letter or digit of a title (skips spaces, punctuation, symbols). */
function firstChar(s: string): string {
  const m = s.match(/[\p{L}\p{N}]/u);
  return m ? m[0].toLocaleUpperCase() : '';
}

function words(s: string): string[] {
  return s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
}

function candidates(title: string): string[] {
  const t = title.trim();
  const f = firstChar(t);
  if (!f) return ['', ''];
  const ws = words(t);
  const last = ws.length > 1 ? firstChar(ws[ws.length - 1]!) : '';
  const letters = [...t].filter((c) => /[\p{L}\p{N}]/u.test(c)).map((c) => c.toLocaleUpperCase());
  return [
    f,
    last ? f + last : letters.slice(0, 2).join(''),
    letters.slice(0, 2).join(''),
    letters.slice(0, 3).join(''),
  ];
}

/**
 * One short name per title, in order. A title that is unique by its first
 * character gets that character alone; only the titles that collide get longer.
 */
export function clashLabels(titles: readonly string[]): string[] {
  const cands = titles.map(candidates);
  const out = cands.map((c) => c[0]!);
  for (let level = 1; level < 4; level++) {
    const count = new Map<string, number>();
    for (const l of out) count.set(l, (count.get(l) ?? 0) + 1);
    let clash = false;
    for (let i = 0; i < out.length; i++) {
      if ((count.get(out[i]!) ?? 0) > 1) { out[i] = cands[i]![level]!; clash = true; }
    }
    if (!clash) break;
  }
  // Still the same (identical titles, or no letters at all): number them —
  // first letter + 1, 2, … — skipping any name already taken.
  const total = new Map<string, number>();
  for (const l of out) total.set(l, (total.get(l) ?? 0) + 1);
  const taken = new Set(out.filter((l) => l && (total.get(l) ?? 0) === 1));
  return out.map((l) => {
    if (l && (total.get(l) ?? 0) === 1) return l;
    const base = l.slice(0, 1) || '#';
    let n = 1;
    while (taken.has(`${base}${n}`)) n++;
    taken.add(`${base}${n}`);
    return `${base}${n}`;
  });
}
