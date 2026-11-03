// When a window-level keyboard shortcut must stand down. One rule for the
// Dock's single keys, the canvas Delete / undo keys and Space push-to-talk:
// never while the user types (fields, the terminal), and never behind a modal.

/** Typing surface: a field, an editable element, or the terminal. */
export function isTypingTarget(t: EventTarget | null): boolean {
  if (t instanceof HTMLElement) {
    if (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return true;
    if (t.closest('.term-body, .xterm')) return true;
  }
  // xterm may keep focus on a helper while the event targets the body.
  const active = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
  return !!active?.closest?.('.term-body, .xterm');
}

/** A focused control that Space / Enter activates (a button, a radio, a link…). */
export function isControlTarget(t: EventTarget | null): boolean {
  return t instanceof HTMLElement
    && !!t.closest('button, a[href], [role="button"], [role="radio"], [role="checkbox"], [role="switch"], [role="menuitem"], [role="option"], [role="tab"]');
}

/** A modal dialog is open (Settings, Commander, …): it owns the keyboard. */
export function isModalOpen(): boolean {
  return typeof document !== 'undefined' && document.querySelector('[aria-modal="true"]') !== null;
}

/** Global single-key / canvas shortcuts: off while typing or behind a modal. */
export function shortcutBlocked(e: KeyboardEvent): boolean {
  return isTypingTarget(e.target) || isModalOpen();
}
