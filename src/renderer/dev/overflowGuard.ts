// UI rule guard (dev builds only): a control's words stay inside it.
//
// The CSS rule in tokens.css keeps short labels on one line. This guard
// catches whatever slips through anyway: every few seconds, while the app is
// idle, it looks at the visible buttons, tabs, menu items and chips, and
// warns once in the console for any whose text wraps when it shouldn't, spills
// past its edge, or is cut off without an ellipsis:
//
//   [ui-rule] text spills out of "New chat" (orb-chat-new)
//
// Never runs in a packaged build (index.tsx imports it behind import.meta.env.DEV).

export interface Spill {
  label: string;
  testId: string;
  problem: 'wraps' | 'spills' | 'cut off';
}

const CONTROLS = 'button, [role="button"], [role="tab"], [role="menuitem"], [role="option"], .task-tag';

/** A control that holds a title and a description may wrap (the CSS rule's exceptions). */
function mayWrap(el: Element): boolean {
  return el.hasAttribute('data-wrap') || !!el.querySelector('div, p, [class*="hint"], [class*="desc"]');
}

/** Text spilling out of, wrapping inside, or cut off in a visible control. */
export function findSpills(root: ParentNode = document): Spill[] {
  const out: Spill[] = [];
  for (const el of root.querySelectorAll<HTMLElement>(CONTROLS)) {
    const box = el.getBoundingClientRect();
    if (box.width < 2 || box.height < 2) continue;
    const st = getComputedStyle(el);
    if (st.visibility === 'hidden' || Number(st.opacity) === 0) continue;
    const label = (el.innerText ?? el.textContent ?? '').trim().replace(/\s+/g, ' ');
    if (!label) continue;
    let wraps = false;
    let spills = false;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent?.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      const rects = [...range.getClientRects()].filter((r) => r.width > 0.5);
      if (new Set(rects.map((r) => Math.round(r.top / 3))).size > 1) wraps = true;
      if (rects.some((r) => r.right > box.right + 1.5 || r.left < box.left - 1.5 || r.bottom > box.bottom + 2 || r.top < box.top - 2)) spills = true;
    }
    const cut = el.scrollWidth > el.clientWidth + 1 && st.textOverflow !== 'ellipsis' && st.overflow !== 'visible';
    const problem: Spill['problem'] | null = spills ? 'spills' : cut ? 'cut off' : wraps && !mayWrap(el) ? 'wraps' : null;
    if (problem) out.push({ label: label.slice(0, 60), testId: el.getAttribute('data-testid') ?? '', problem });
  }
  return out;
}

const warned = new Set<string>();

export function startOverflowGuard(everyMs = 4000): () => void {
  const check = () => {
    for (const s of findSpills()) {
      const key = `${s.testId}|${s.label}|${s.problem}`;
      if (warned.has(key)) continue;
      warned.add(key);
      console.warn(`[ui-rule] text ${s.problem === 'wraps' ? 'wraps inside' : s.problem === 'spills' ? 'spills out of' : 'is cut off in'} "${s.label}"${s.testId ? ` (${s.testId})` : ''} — see docs/04-visual-system/design-tokens.md, "text never touches an edge"`);
    }
  };
  const id = window.setInterval(() => { window.requestIdleCallback(check, { timeout: 1000 }); }, everyMs);
  return () => window.clearInterval(id);
}
