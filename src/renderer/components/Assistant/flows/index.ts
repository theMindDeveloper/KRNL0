import type { Flow } from '../types';
import { focusSessionFlow } from './focusSession';
import { sessionFromCommanderFlow } from './sessionFromCommander';

// Built-in flows the orb can run when a message names them ("focus session").
// sessionFromCommanderFlow is launched from the Commander popup, not the menu.
// (The old intro and Pomo/Todo walkthroughs were replaced by the guided tours.)
export const FLOWS: Flow[] = [
  focusSessionFlow,
];

export {
  focusSessionFlow,
  sessionFromCommanderFlow,
};
