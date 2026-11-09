// Observe mode — label a span that just ended, in one row:
//   [ what did you do? ] [ category ▾ ] [ ✓ ]
// The dropdown holds the categories (shared tag library, ADR 0016, guessed
// from the name), "+ new category", and your tasks: picking a task counts the
// time toward that task instead. One choice, not two concepts.

import { LineGlyph } from '../../ui/LineGlyph';
import { useRef, useState } from 'react';
import type { TagDef } from '../../../../shared/tags/classify';
import { Popover } from '../../ui/Popover';
import { TaskTagPicker } from '../../ui/TaskTagPicker';
import { CategoryIcon } from './CategoryIcon';

export interface SpanLabelerProps {
  minutes: number;
  initialText: string;
  /** Open tasks, then tasks done today (`done: true`, own group — #204). */
  tasks: ReadonlyArray<{ id: string; text: string; done?: boolean }>;
  library: readonly TagDef[];
  /** Classifier guess for a name (null = none). */
  guess: (text: string) => string | null;
  onSave: (label: { taskId: string } | { text: string; tag: string | null }) => void;
  onSkip: () => void;
  onAddCategory: (label: string) => void;
}

type Pick = { kind: 'tag'; id: string } | { kind: 'task'; id: string } | null;
// The dropdown is the shared TaskTagPicker (search, tasks first, category chips).

const mono: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-4)' };

export function SpanLabeler({ minutes, initialText, tasks, library, guess, onSave, onSkip, onAddCategory }: SpanLabelerProps) {
  const [text, setText] = useState(initialText);
  const [pick, setPick] = useState<Pick>(null);
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);

  const guessed = text.trim() ? guess(text) : null;
  const tagId = pick?.kind === 'tag' ? pick.id : pick === null ? guessed : null;
  const tag = tagId ? library.find((t) => t.id === tagId) : undefined;
  const task = pick?.kind === 'task' ? tasks.find((t) => t.id === pick.id) : undefined;
  const canSave = !!task || text.trim() !== '';

  const save = () => {
    if (!canSave) return;
    onSave(task ? { taskId: task.id } : { text: text.trim(), tag: tagId });
  };
  const choose = (p: Pick) => { setPick(p); setOpen(false); };



  return (
    <div
      data-testid="pomo-ask"
      onMouseDown={(e) => e.stopPropagation()}
      style={{ display: 'flex', flexDirection: 'column', gap: 5 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={mono}>Name this span · {Math.max(1, minutes)} min</span>
        <button
          type="button"
          data-testid="pomo-ask-skip"
          aria-label="Skip"
          title="Skip — leave it unlabelled (fix it later in ☰)"
          onClick={onSkip}
          style={{ background: 'transparent', border: 'none', color: 'var(--ink-3)', cursor: 'pointer', fontSize: 11, padding: 0, lineHeight: 1 }}
        >
          <LineGlyph name="close" size={10} />
        </button>
      </div>

      <div style={{ display: 'flex', gap: 4, height: 30 }}>
        <input
          data-testid="pomo-ask-text"
          autoFocus
          value={task ? task.text : text}
          disabled={!!task}
          placeholder="What did you do?"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') onSkip();
          }}
          style={{
            flex: 1, minWidth: 0, background: 'var(--paper-2)', color: 'var(--ink)', border: '1px solid var(--paper-3)', borderRadius: 5,
            padding: '0 8px', fontFamily: 'var(--font-mono)', fontSize: 11, outline: 'none',
          }}
        />
        <button
          ref={anchor}
          type="button"
          data-testid="pomo-ask-what"
          title="Category, or a task this time counts toward"
          onClick={() => setOpen((o) => !o)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, maxWidth: 120, padding: '0 8px', cursor: 'pointer',
            background: 'var(--paper-2)', border: `1px solid ${tag ? tag.color : 'var(--paper-3)'}`, borderRadius: 5,
            color: tag || task ? 'var(--ink)' : 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: 11,
          }}
        >
          {task ? <span aria-hidden style={{ display: 'inline-flex' }}><LineGlyph name="task" size={11} /></span> : tag ? <CategoryIcon id={tag.id} color={tag.color} size={11} /> : null}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {task ? 'task' : tag ? tag.label : 'category'}
          </span>
          <span aria-hidden style={{ opacity: 0.6, fontSize: 11 }}><LineGlyph name="caretDown" size={9} /></span>
        </button>
        <button
          type="button"
          data-testid="pomo-ask-save"
          aria-label="Save"
          title="Save (Enter)"
          onClick={save}
          disabled={!canSave}
          style={{
            width: 30, borderRadius: 5, border: 'none', cursor: canSave ? 'pointer' : 'default',
            background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-fg)', opacity: canSave ? 1 : 0.4, fontSize: 13, fontWeight: 700,
          }}
        >
          <LineGlyph name="check" size={11} weight={2.6} />
        </button>
      </div>

      <Popover anchor={anchor.current} open={open} onClose={() => setOpen(false)} minWidth={250}>
        {/* #207 UX — one compact searchable picker: tasks first, categories as chips. */}
        <TaskTagPicker
          testIdPrefix="pomo-ask"
          tasks={tasks}
          library={library}
          value={task ? { kind: 'task', id: task.id } : tagId ? { kind: 'tag', id: tagId } : null}
          onPick={(v) => choose(v)}
          onAddCategory={onAddCategory}
          onClose={() => setOpen(false)}
        />
      </Popover>
    </div>
  );
}
