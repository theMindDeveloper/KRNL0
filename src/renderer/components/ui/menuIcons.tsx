// Line icons for menus and small controls: 14 px, 1.6 stroke, round caps,
// currentColor — the app's own style (no emoji, no icon font).

import type { ReactNode } from 'react';

const P: Record<string, ReactNode> = {
  when: <><rect x="3" y="4.5" width="18" height="16" rx="2.5" /><path d="M3 9.5h18M8 2.5v4M16 2.5v4" /><path d="M12 13v3l2 1.2" /></>,
  day: <><rect x="3" y="4.5" width="18" height="16" rx="2.5" /><path d="M3 9.5h18M8 2.5v4M16 2.5v4M7 14h4" /></>,
  deadline: <path d="M5 21V3.5M5 4h12l-2.5 4L17 12H5" />,
  length: <><path d="M6 3h12M6 21h12" /><path d="M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9" /></>,
  reminder: <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0" />,
  play: <path d="M7 4.5v15l12-7.5z" />,
  observe: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></>,
  show: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></>,
  tag: <><path d="M3 12V4.5A1.5 1.5 0 0 1 4.5 3H12l9 9-9 9z" /><circle cx="8" cy="8" r="1.5" /></>,
  rename: <path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17zM14.5 7.5l3 3" />,
  drop: <><circle cx="12" cy="12" r="8.5" /><path d="M6 18L18 6" /></>,
  delete: <path d="M4 6.5h16M9.5 6.5V4h5v2.5M6.5 6.5l1 13.5h9l1-13.5M10 10.5v6M14 10.5v6" />,
  skip: <path d="M5 5v14l9-7zM18 5v14" />,
  move: <path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3" />,
  edit: <path d="M4 7h10M18 7h2M4 17h4M12 17h8M14 4.5v5M8 14.5v5" />,
  end: <><circle cx="12" cy="12" r="8.5" /><rect x="9" y="9" width="6" height="6" rx="1" /></>,
  restart: <path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4" />,
  undo: <path d="M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />,
  unschedule: <><rect x="3" y="4.5" width="18" height="16" rx="2.5" /><path d="M3 9.5h18M8 2.5v4M16 2.5v4M9.5 12.5l5 5M14.5 12.5l-5 5" /></>,
  find: <><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></>,
  color: <><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5a8.5 8.5 0 0 0 0 17z" fill="currentColor" stroke="none" /></>,
  icon: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><circle cx="17" cy="7" r="3.5" /><path d="M7 14l3.5 6.5h-7zM14 14h6.5v6.5H14z" /></>,
  note: <><path d="M5 3.5h10l4 4v13H5z" /><path d="M15 3.5v4h4M8.5 12h7M8.5 16h5" /></>,
  archive: <><rect x="3" y="4" width="18" height="4.5" rx="1" /><path d="M4.5 8.5V20h15V8.5M10 12.5h4" /></>,
  rest: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />,
  amount: <><path d="M7 3.5h10l-1.5 17h-7z" /><path d="M7.6 10h8.8" /></>,
  target: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" fill="currentColor" /></>,
  repeat: <path d="M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4" />,
  convert: <path d="M4 8h13l-3-3M20 16H7l3 3" />,
  check: <path d="M4.5 12.5l5 5L19.5 7" />,
  event: <><rect x="3" y="4.5" width="18" height="16" rx="2.5" /><path d="M3 9.5h18M8 2.5v4M16 2.5v4" /><rect x="7" y="12.5" width="10" height="4.5" rx="1" fill="currentColor" stroke="none" opacity=".55" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  canvas: <><rect x="3" y="3" width="18" height="18" rx="2.5" /><path d="M8 3v18M3 9h5" /></>,
};

export type MenuIconName = keyof typeof P;

export function MenuIcon({ name, size = 14 }: { name: MenuIconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {P[name]}
    </svg>
  );
}
