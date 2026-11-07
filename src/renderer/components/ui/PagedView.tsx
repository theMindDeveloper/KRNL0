// PagedView — "pages, not scrolling" for every window (Pomo, Todo, Clock,
// Calendar agenda, Analytics …).
//
// Content that doesn't fit is split into pages of WHOLE items (an item is
// never cut in half at the bottom edge). The mouse wheel / trackpad flips one
// page at a time, and a small pager (‹ ● ○ ○ ›) appears only when there is
// more than one page. Nothing ever shows a scrollbar.
//
// Items are the elements matching `itemSelector` (default: the direct
// children). Pages are recomputed whenever the box or its content resizes.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';

const PAGER_H = 22;
const WHEEL_COOLDOWN_MS = 320;

export interface PagedViewProps {
  children: ReactNode;
  /** CSS selector (relative to the content box) for the items pages are cut between. */
  itemSelector?: string;
  /** Styles for the outer box (it should get a definite height, e.g. flex: 1 + minHeight: 0). */
  style?: CSSProperties;
  /** Styles for the content box (padding, gap …). */
  contentStyle?: CSSProperties;
  testId?: string;
  /** Jump back to page 1 when this value changes (e.g. the active tab). */
  resetKey?: unknown;
  /** Index of an item that must be visible (its page is shown when it changes). */
  revealIndex?: number;
  /**
   * One item per page, sized to the whole page: the content box gets
   * `--page-h` (the page height) and items should use `height: var(--page-h)`.
   * A page then always shows exactly one complete item — never a sliver of
   * the previous or next one.
   */
  fillItems?: boolean;
  /** Jump to the page holding the first item matching this selector (on change). */
  revealSelector?: string | null;
  /** Called with the item at the top of the current page whenever it changes. */
  onPageChange?: (item: HTMLElement | null, page: number, pages: number) => void;
  /** Show the ‹ ● › pager (default). Off when the host has its own navigation. */
  showPager?: boolean;
}

/**
 * Cut items into pages: a new page starts at the first item whose bottom
 * would pass the visible height. Pure — exported for tests.
 */
export function computePageStarts(items: ReadonlyArray<{ top: number; bottom: number }>, height: number): number[] {
  const starts = [0];
  if (height <= 0) return starts;
  let start = 0;
  for (const it of items) {
    if (it.bottom - start > height + 0.5 && it.top > start + 0.5) {
      start = it.top;
      starts.push(start);
    }
  }
  return starts;
}

export function PagedView({
  children,
  itemSelector = ':scope > *',
  style,
  contentStyle,
  testId,
  resetKey,
  revealIndex,
  fillItems = false,
  revealSelector,
  onPageChange,
  showPager = true,
}: PagedViewProps) {
  const outerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [starts, setStarts] = useState<number[]>([0]);
  const [contentH, setContentH] = useState(0);
  const [boxH, setBoxH] = useState(0);
  const [page, setPage] = useState(0);
  const [itemCount, setItemCount] = useState(0);
  const lastWheel = useRef(0);
  const itemTops = useRef<number[]>([]);
  const itemEls = useRef<HTMLElement[]>([]);

  const measure = useCallback(() => {
    const outer = outerRef.current;
    const content = contentRef.current;
    if (!outer || !content) return;
    const full = outer.clientHeight;
    // Offsets relative to the content box — the page shift (transform) moves
    // the box and its items together, so it cancels out.
    const contentRect = content.getBoundingClientRect();
    const base = contentRect.top;
    // Screen rects are scaled by any ancestor transform (the canvas zoom);
    // page heights are layout px. Divide the scale back out.
    const scale = content.offsetHeight > 0 && contentRect.height > 0 ? contentRect.height / content.offsetHeight : 1;
    // Visual order (CSS `order` can differ from DOM order).
    const measured = Array.from(content.querySelectorAll<HTMLElement>(itemSelector))
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { el, top: (r.top - base) / scale, bottom: (r.bottom - base) / scale };
      })
      .filter((m) => m.bottom > m.top)
      .sort((a, b) => a.top - b.top);
    itemEls.current = measured.map((m) => m.el);
    const items = measured.map(({ top, bottom }) => ({ top, bottom }));
    itemTops.current = items.map((i) => i.top);
    setItemCount((c) => (c === items.length ? c : items.length));
    let next = computePageStarts(items, full);
    if (next.length > 1 && showPager) next = computePageStarts(items, full - PAGER_H);
    setBoxH((h) => (h === full ? h : full));
    setContentH((h) => (h === content.scrollHeight ? h : content.scrollHeight));
    setStarts((prev) => (prev.length === next.length && prev.every((v, i) => Math.abs(v - next[i]!) < 0.5) ? prev : next));
  }, [itemSelector, showPager]);

  useLayoutEffect(() => { measure(); });

  useEffect(() => {
    const outer = outerRef.current;
    const content = contentRef.current;
    if (!outer || !content || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(outer);
    ro.observe(content);
    return () => ro.disconnect();
  }, [measure]);

  const pages = starts.length;
  const current = Math.min(page, pages - 1);
  useEffect(() => { if (page !== current) setPage(current); }, [page, current]);
  useEffect(() => { setPage(0); }, [resetKey]);
  useEffect(() => {
    if (revealIndex === undefined || revealIndex < 0) return;
    const top = itemTops.current[revealIndex];
    if (top === undefined) return;
    let p = 0;
    for (let i = 0; i < starts.length; i++) if (starts[i]! <= top + 0.5) p = i;
    setPage(p);
  }, [revealIndex, starts]);

  useEffect(() => {
    if (!revealSelector) return;
    const el = contentRef.current?.querySelector<HTMLElement>(revealSelector);
    const i = el ? itemEls.current.indexOf(el) : -1;
    const top = i >= 0 ? itemTops.current[i] : undefined;
    if (top === undefined) return;
    let p = 0;
    for (let k = 0; k < starts.length; k++) if (starts[k]! <= top + 0.5) p = k;
    setPage(p);
  }, [revealSelector, starts]);

  // Report the item at the top of the shown page.
  useEffect(() => {
    if (!onPageChange) return;
    const top = starts[current] ?? 0;
    const i = itemTops.current.findIndex((t) => Math.abs(t - top) < 0.5);
    onPageChange(i >= 0 ? itemEls.current[i] ?? null : null, current, pages);
  }, [current, starts, pages, onPageChange]);

  const go = useCallback((delta: number) => {
    setPage((p) => Math.max(0, Math.min(pages - 1, p + delta)));
  }, [pages]);

  const onWheel = (e: React.WheelEvent) => {
    if (pages <= 1 || Math.abs(e.deltaY) < 4) return;
    e.stopPropagation();
    const now = Date.now();
    if (now - lastWheel.current < WHEEL_COOLDOWN_MS) return;
    lastWheel.current = now;
    go(e.deltaY > 0 ? 1 : -1);
  };

  const start = starts[current] ?? 0;
  const end = current + 1 < pages ? starts[current + 1]! : contentH;
  const pagerH = showPager ? PAGER_H : 0;
  const visibleH = pages > 1 ? Math.min(boxH - pagerH, end - start) : boxH;

  return (
    <div
      ref={outerRef}
      data-testid={testId}
      data-pages={pages}
      data-page={current}
      className={pages > 1 ? 'nowheel' : undefined}
      onWheel={onWheel}
      style={{ position: 'relative', minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', ...style }}
    >
      <div style={{ height: pages > 1 ? Math.max(0, visibleH) : '100%', overflow: 'hidden', flexShrink: 0 }}>
        <div
          ref={contentRef}
          style={{
            // margin, not transform: a transformed layer inside the zoomed
            // canvas is rasterised then scaled (blurry text). Whole pixels only.
            marginTop: -Math.round(start),
            transition: 'margin-top 180ms ease',
            ...(fillItems ? { ['--page-h' as string]: `${Math.max(0, boxH - (itemCount > 1 && showPager ? PAGER_H : 0))}px` } : {}),
            ...contentStyle,
          }}
        >
          {children}
        </div>
      </div>
      {pages > 1 && showPager && (
        <div
          data-testid={testId ? `${testId}-pager` : 'paged-pager'}
          style={{
            position: 'absolute', left: 0, right: 0, bottom: 0, height: PAGER_H,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-3)',
          }}
        >
          <PagerBtn label="Previous page" disabled={current === 0} onClick={() => go(-1)}>‹</PagerBtn>
          {Array.from({ length: pages }, (_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Page ${i + 1} of ${pages}`}
              aria-current={i === current ? 'page' : undefined}
              onClick={(e) => { e.stopPropagation(); setPage(i); }}
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                width: i === current ? 14 : 6, height: 6, padding: 0, border: 'none', borderRadius: 999,
                background: i === current ? 'var(--acid, #c9f158)' : 'var(--paper-3)',
                cursor: 'pointer', transition: 'width 160ms ease',
              }}
            />
          ))}
          <PagerBtn label="Next page" disabled={current === pages - 1} onClick={() => go(1)}>›</PagerBtn>
        </div>
      )}
    </div>
  );
}

function PagerBtn({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        background: 'transparent', border: 'none', padding: '0 4px', lineHeight: 1,
        color: disabled ? 'var(--ink-4)' : 'var(--ink-2)', opacity: disabled ? 0.4 : 1,
        cursor: disabled ? 'default' : 'pointer', fontSize: 14, fontFamily: 'var(--font-mono)',
      }}
    >
      {children}
    </button>
  );
}
