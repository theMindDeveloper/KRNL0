import type { Flow } from '../types';
import { introFlow } from './intro';
import { whatNextFlow } from './whatNext';
import { summarizeFlow } from './summarize';
import { focusSessionFlow } from './focusSession';
import { demoFlow } from './demo';
import { tutorialFlow } from './tutorial';
import { sessionFromCommanderFlow } from './sessionFromCommander';

// All registered flows — order determines display in the chat panel.
// sessionFromCommanderFlow is launched from the Commander popup, not the menu.
export const FLOWS: Flow[] = [
  whatNextFlow,
  summarizeFlow,
  focusSessionFlow,
  tutorialFlow,
  demoFlow,
  introFlow,
];

export {
  introFlow,
  whatNextFlow,
  summarizeFlow,
  focusSessionFlow,
  demoFlow,
  tutorialFlow,
  sessionFromCommanderFlow,
};
