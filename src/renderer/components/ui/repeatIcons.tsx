// Small line icons for the repeat / schedule UI (14px, currentColor).
const base = { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };

export const IconRepeat = () => (<svg {...base}><path d="M3 7a5 5 0 0 1 8.6-3.4L13 5" /><path d="M13 2v3h-3" /><path d="M13 9a5 5 0 0 1-8.6 3.4L3 11" /><path d="M3 14v-3h3" /></svg>);
export const IconClock = () => (<svg {...base}><circle cx="8" cy="8" r="6" /><path d="M8 4.5V8l2.5 1.5" /></svg>);
export const IconTimer = () => (<svg {...base}><circle cx="8" cy="9" r="5.5" /><path d="M8 9V6M6 1.5h4M12.5 4l1-1" /></svg>);
export const IconCalendarDay = () => (<svg {...base}><rect x="2" y="3" width="12" height="11" rx="2" /><path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" /><rect x="6.5" y="8.5" width="3" height="3" rx="0.6" fill="currentColor" stroke="none" /></svg>);
export const IconCalendarAll = () => (<svg {...base}><rect x="2" y="3" width="12" height="11" rx="2" /><path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3M5 9.5h6M5 11.8h6" /></svg>);
export const IconBriefcase = () => (<svg {...base}><rect x="2" y="5" width="12" height="8.5" rx="1.5" /><path d="M6 5V3.5h4V5M2 9h12" /></svg>);
export const IconDots = () => (<svg {...base}><circle cx="4" cy="8" r="1.2" fill="currentColor" /><circle cx="8" cy="8" r="1.2" fill="currentColor" /><circle cx="12" cy="8" r="1.2" fill="currentColor" /></svg>);
export const IconCheck = () => (<svg {...base}><path d="M3 8.5l3.2 3L13 4.5" /></svg>);
