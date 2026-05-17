// Canvas layout constants used by sys commands that spawn nodes.
//
// Why these live here: the user complained that AI-generated pipelines
// landed visually messy — tasks too tight against each other, frames
// smaller than their contents, new chains overlapping the dock. Pulling
// the numbers into one file makes the spacing rules visible and tunable.
//
// Visual reference (approximate, see node components for canonical):
//   TaskNode body  : ~220 × ~140 px
//   FrameNode body : variable; default 360 × 240
//   Mother row     : sits along the top dock, ~540 tall
//
// Gaps are measured edge-to-edge (not center-to-center), so an effective
// horizontal gap of 80 px between two TaskNodes means: source.x + TASK_W +
// 80 = next.x.

export const TASK_W = 220;
export const TASK_H = 140;

/** Edge-to-edge horizontal gap between sequential / sibling tasks. */
export const TASK_GAP_X = 80;

/** Edge-to-edge vertical gap between parallel-fork siblings. */
export const TASK_GAP_Y = 120;

/**
 * Vertical offset from a mother node's TOP to the first spawned task's TOP.
 *
 * Mother nodes are MOTHER_HEIGHT = 540 tall. The previous value of 580 left
 * only ~40 px of breathing room below the dock — AI-generated chains
 * clipped the mother row in screenshots. 760 = 540 mother height + 220 px
 * gap, which clears the dock and gives the visual cluster room to read as
 * its own thing.
 */
export const MOTHER_OFFSET_Y = 760;

/**
 * Vertical offset from a mother node's TOP to the first spawned habit lane.
 *
 * Habit lanes used to spawn at motherY + 540 — exactly the Y band where
 * tasks land. They competed for the same strip, producing the
 * "exercise lane next to the run task" visual collision the user
 * reported (2026-05-17, second feedback round). Pushed deep below the
 * typical task-chain band so the two surfaces never overlap.
 */
export const HABIT_LANE_OFFSET_Y = 1300;

/** Default padding around a frame's contents (per side). */
export const FRAME_PADDING = 40;

/** Minimum useful frame size — frames smaller than this read as accidents. */
export const FRAME_MIN_W = 320;
export const FRAME_MIN_H = 200;

/** Center-to-center horizontal step between consecutive tasks. */
export const TASK_STEP_X = TASK_W + TASK_GAP_X;        // 300

/** Center-to-center vertical step between parallel-fork siblings. */
export const TASK_STEP_Y = TASK_H + TASK_GAP_Y;        // 260
