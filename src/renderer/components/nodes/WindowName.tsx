// A window's name in its header (window-frame.md: `.kw-title`). Where the
// window sits in a slot you may fill yourself (the phone's sideways dock and
// the iPad's Today, Decision 67), the name is a button with a small chevron:
// a tap opens the list of windows to put there. Everywhere else it is the
// plain name, exactly as before.

import { createContext, useContext, type ReactNode } from 'react';

/** Set by a slot that can hold another window: called with the name's button to open the list there. */
export const WindowPickContext = createContext<((anchor: HTMLElement) => void) | null>(null);

export function WindowName({ children, testId }: { children: ReactNode; testId?: string }): JSX.Element {
  const pick = useContext(WindowPickContext);
  if (!pick) return <span className="kw-title" data-testid={testId}>{children}</span>;
  return (
    <button
      type="button"
      className="kw-title kw-title--pick nodrag nopan"
      aria-haspopup="menu"
      data-testid={testId}
      onClick={(e) => { e.stopPropagation(); pick(e.currentTarget); }}
    >
      {children}
      <svg width={12} height={12} viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
  );
}
