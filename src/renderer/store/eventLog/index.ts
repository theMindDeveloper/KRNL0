export { useEventLog, __resetEventLogForTests } from './store';
export { emit } from './emit';
export { installGlobalErrorCapture } from './globalErrors';
export { installBoardSaveLogging } from './boardSaveLogging';
export type {
  EventKind,
  EventEntry,
  EventSeverity,
} from './types';
export { EVENT_LOG_MAX } from './types';
