import type { Flow } from '../types';
import { introFlow } from './intro';
import { focusSessionFlow } from './focusSession';
import { tutorialPomoTodoFlow } from './tutorialPomoTodo';
import { sessionFromCommanderFlow } from './sessionFromCommander';

// All registered flows — order determines display in the chat panel.
// sessionFromCommanderFlow is launched from the Commander popup, not the menu.
export const FLOWS: Flow[] = [
  focusSessionFlow,
  tutorialPomoTodoFlow,
  introFlow,
];

export {
  introFlow,
  focusSessionFlow,
  tutorialPomoTodoFlow,
  sessionFromCommanderFlow,
};
