// Every launch-experience surface in one place (launch-experience.md).
// Mounted once by App; each part renders nothing while it is closed.

import { WhatsNewDialog } from './WhatsNewDialog';
import { PatchNotice } from './PatchNotice';
import { WelcomeBack } from './WelcomeBack';
import { FeedbackDialog } from './FeedbackDialog';
import { MilestoneNotice } from './MilestoneNotice';

export function LaunchHost() {
  return (
    <>
      <PatchNotice />
      <MilestoneNotice />
      <WhatsNewDialog />
      <WelcomeBack />
      <FeedbackDialog />
    </>
  );
}
