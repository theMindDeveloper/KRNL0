/**
 * TagPicker — ADR 0016. Portal popover for choosing a TodoItem's tag.
 *
 * The classifier's best guesses for this item's text are listed first, then
 * the rest of the library. Typing filters; Enter picks the first match, or
 * creates a new custom tag when nothing matches. "Auto" hands the item back
 * to the classifier. Dismisses on click-outside or ESC, like ContextMenu.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { TodoItem, TodoState } from './types';
import { tagExamples, todoTagLibrary } from './commands';
import { scoreTags } from '../../../../shared/tags/classify';
import type { TagDef } from '../../../../shared/tags/classify';
import { Z } from '../../ui/layers';

export interface TagPickerProps {
  x: number;
  y: number;
  item: TodoItem;
  state: TodoState;
  /** Tag id or new label; null = back to auto. */
  onPick: (tag: string | null) => void;
  onDismiss: () => void;
}

const SUGGESTION_COUNT = 3;

export function TagPicker({ x, y, item, state, onPick, onDismiss }: TagPickerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onDismiss();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [onDismiss]);

  const library = todoTagLibrary(state);
  const { suggested, rest } = useMemo(() => {
    const ranked = scoreTags(item.text, library, tagExamples(state, item.id))
      .slice(0, SUGGESTION_COUNT)
      .map((m) => library.find((t) => t.id === m.tagId))
      .filter((t): t is TagDef => t !== undefined);
    const ids = new Set(ranked.map((t) => t.id));
    return { suggested: ranked, rest: library.filter((t) => !ids.has(t.id)) };
  }, [item.text, item.id, library, state]);

  const q = query.trim().toLowerCase();
  const matches = (t: TagDef) => !q || t.label.toLowerCase().includes(q) || t.id.includes(q);
  const shownSuggested = suggested.filter(matches);
  const shownRest = rest.filter(matches);
  const exact = library.some((t) => t.label.toLowerCase() === q || t.id === q);

  const pick = (tag: string | null) => {
    onPick(tag);
    onDismiss();
  };

  const row = (t: TagDef, hint?: string) => (
    <button
      key={t.id}
      type="button"
      data-testid={`tag-option-${t.id}`}
      onClick={() => pick(t.id)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        padding: '5px 10px',
        background: item.tag === t.id ? 'var(--paper-2)' : 'transparent',
        border: 'none',
        cursor: 'pointer',
        fontFamily: 'var(--font-sans)',
        fontSize: 12,
        color: 'var(--ink)',
        textAlign: 'left',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--paper-2)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = item.tag === t.id ? 'var(--paper-2)' : 'transparent'; }}
    >
      <span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', background: t.color, flexShrink: 0 }} />
      <span style={{ flex: 1 }}>{t.label}</span>
      {item.tag === t.id && <span style={{ fontSize: 10, color: 'var(--acid-ink, var(--acid))' }}>✓</span>}
      {hint && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, color: 'var(--ink-4)', letterSpacing: '0.06em' }}>{hint}</span>}
    </button>
  );

  const sectionLabel = (text: string) => (
    <div style={{ padding: '6px 10px 2px', fontFamily: 'var(--font-mono)', fontSize: 8.5, color: 'var(--ink-4)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
      {text}
    </div>
  );

  // Keep the popover on-screen: flip up/left when it would overflow.
  const W = 210;
  const H = 320;
  const left = typeof window !== 'undefined' ? Math.min(x, window.innerWidth - W - 8) : x;
  const top = typeof window !== 'undefined' && y + H > window.innerHeight ? Math.max(8, y - H) : y;

  const picker = (
    <div
      ref={ref}
      data-testid="tag-picker"
      onMouseDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        left,
        top,
        zIndex: Z.contextMenu,
        width: W,
        maxHeight: H,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--paper)',
        border: '1px solid var(--paper-3)',
        borderRadius: 6,
        boxShadow: 'var(--shadow-1)',
        overflow: 'hidden',
      }}
    >
      <input
        autoFocus
        data-testid="tag-picker-input"
        value={query}
        placeholder="Find or create a tag…"
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          e.stopPropagation();
          const first = shownSuggested[0] ?? shownRest[0];
          if (q && !exact && query.trim()) pick(query.trim());
          else if (first) pick(first.id);
        }}
        style={{
          border: 'none',
          borderBottom: '1px solid var(--paper-3)',
          outline: 'none',
          background: 'transparent',
          padding: '8px 10px',
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--ink)',
          caretColor: 'var(--acid)',
        }}
      />
      <div style={{ overflowY: 'auto', paddingBottom: 4 }}>
        {shownSuggested.length > 0 && sectionLabel('Suggested')}
        {shownSuggested.map((t, i) => row(t, i === 0 ? 'BEST' : undefined))}
        {shownRest.length > 0 && sectionLabel('All tags')}
        {shownRest.map((t) => row(t))}
        {q && !exact && (
          <button
            type="button"
            data-testid="tag-picker-create"
            onClick={() => pick(query.trim())}
            style={{
              display: 'block',
              width: '100%',
              padding: '6px 10px',
              background: 'transparent',
              border: 'none',
              borderTop: '1px dashed var(--paper-3)',
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
              fontSize: 12,
              color: 'var(--ink-2, var(--ink))',
              textAlign: 'left',
            }}
          >
            + Create “{query.trim()}”
          </button>
        )}
        <button
          type="button"
          data-testid="tag-option-auto"
          onClick={() => pick(null)}
          style={{
            display: 'block',
            width: '100%',
            padding: '6px 10px',
            background: 'transparent',
            border: 'none',
            borderTop: '1px solid var(--paper-3)',
            cursor: 'pointer',
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--ink-4)',
            textAlign: 'left',
            letterSpacing: '0.04em',
          }}
        >
          ↺ AUTO{item.tagSource === 'auto' || item.tag === undefined ? ' (current)' : ''}
        </button>
      </div>
    </div>
  );

  return createPortal(picker, document.body);
}
