// Observe mode — tags on recorded pomo spans (ADR 0016 tag system).
//
// A span tagged with a task keeps the task's tone. A free-text span ("emails")
// carries a tag id from the same library the Todo list uses, so Clock,
// Calendar and Analytics colour and group it like any tagged task.

import type { Board } from '../../shared/types';
import type { TodoState } from '../components/nodes/TodoNode/types';
import { tagExamples } from '../components/nodes/TodoNode/commands';
import { classifyTask, findTag, mergeTagLibrary, tagDisplay } from '../../shared/tags/classify';
import type { TagDef } from '../../shared/tags/classify';
import { toneVarForTask } from '../utils/taskColor';

function todoState(board: Pick<Board, 'nodes'> | null): TodoState | undefined {
  const nodes = board?.nodes ?? [];
  const todo = nodes.find((n) => n.kind === 'todo' && n.isMother) ?? nodes.find((n) => n.kind === 'todo');
  return todo?.state as TodoState | undefined;
}

/** Built-in tags plus the user's custom ones. */
export function boardTagLibrary(board: Pick<Board, 'nodes'> | null): readonly TagDef[] {
  return mergeTagLibrary(todoState(board)?.tagLibrary);
}

/**
 * Tag id for a free-text span: the explicit tag when it names a known tag,
 * else the classifier's guess from the text, else null (untagged).
 */
export function spanTagFor(board: Pick<Board, 'nodes'> | null, text: string, explicit?: string | null): string | null {
  const library = boardTagLibrary(board);
  if (explicit) return findTag(library, explicit)?.id ?? null;
  const ts = todoState(board);
  return classifyTask(text, library, ts ? tagExamples(ts) : []);
}

/** Colour of a free-text span's tag, or null when it has none. */
export function spanTagColor(library: readonly TagDef[], tag: string | null | undefined): string | null {
  return tag ? tagDisplay(library, tag).color : null;
}

/**
 * The one colour of a recorded span: a task span takes its task's tone (the
 * same colour as the task's planned block, so plan and reality overlap in one
 * colour), a named span its category, an unnamed one acid, a break grey.
 */
export function spanTone(
  library: readonly TagDef[],
  seg: { kind: 'work' | 'break'; taskId?: string | null; tag?: string | null },
): string {
  if (seg.kind === 'break') return 'var(--ink-3)';
  if (seg.taskId) return toneVarForTask(seg.taskId);
  return spanTagColor(library, seg.tag) ?? 'var(--acid)';
}
