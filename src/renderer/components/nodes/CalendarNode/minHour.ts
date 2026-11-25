// The shortest an hour may be when the Calendar fits the day to its window
// (Decision 60 fits it, at any size). 0 everywhere but a screen too short to
// read a fitted day: a phone on its side sets 20 px (Decision 67), and the
// hours scroll there instead of shrinking to slivers.
import { createContext } from 'react';

export const CalendarMinHourContext = createContext(0);
/** px: an hour on a phone held sideways. */
export const DOCK_MIN_HOUR = 20;
