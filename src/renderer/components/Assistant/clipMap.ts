/**
 * clipMap — maps friendly clip IDs to filename stems (no .mp3).
 * VoicePlayer.ts auto-discovers every mp3 under ./audio/** via import.meta.glob,
 * so the folder location of a clip doesn't matter — only the filename stem does.
 * Add new clips: drop the .mp3 in the right audio/<bucket>/ folder and add a
 * mapping line below.
 */
import { ORB_LINES } from './orbLines';

export const CLIP_MAP: Record<string, string> = {
  // ── audio/click/ — orb click acknowledgments ───────────────────────────────
  'click_yes':       'yes',
  'click_aha1':      'aha1',
  'click_aha2':      'aha2',
  'click_im_here':   'amhere',
  'click_go_ahead':  'goahead',
  'click_hey':       'hey',
  'click_listening': 'listening',
  'click_mm':        'mm',
  'click_sup':       'sup',
  'click_whats_up1': "what'sup1",
  'click_whats_up2': "what'sup2",
  'click_yeah':      'yeah',
  'click_leave':     'canyouleavemelaone',
  'click_see_you_later': 'click_see_you_later',


  // ── audio/flows/focus/ ─────────────────────────────────────────────────────
  'focus_01':    "Alright. Let's lock in",
  'focus_02':    "I'm starting a twenty-five minute focus timer",
  'focus_04':    "The timer is running. I'll let you know when the break kicks in",
  'focus_none':  "I don't see a Pomodoro timer on your board yet. Let me add one",
  'focus_added': "Done. Your timer is ready. Hit start when you are",


  // ── audio/commander/ ───────────────────────────────────────────────────────
  'cmd_open':       "Commander online.",
  'cmd_got_it':     "gotitsettingthatupnow",
  'cmd_more':       "whatareyouplanning",
  'cmd_locked':     "sessionlockedin",

  // ── audio/proactive/ — fired automatically by ProactiveEngine ──────────────
  'pa_task_done':         "done one less thing",
  'pa_task_been_sitting': "that one has been sitting",
  'pa_streak_7':          "7 in a row habbit",
  'pa_good_job':          "good job",
  'pa_perfect':           "perfect",
  'pa_youre_cooking':     "your cooking",
  'pa_good_session':      "good session whatever that was",
  'pa_break_start':       "break time stand up",
  'pa_break_ending':      "break almsot up",
  'pa_first_task':        "first task on the board",
  'pa_first_sched':       "first sched item",
  'pa_first_habit_today': "first one in day started",
  'pa_task_starting':     "starting the task",
  'pa_block_done':        "that block is done",
  'pa_new_task':          "creating new task",
  'pa_new_habit_a':       "creating new habbit",
  'pa_new_habit_b':       "new habit",
  'pa_new_day':           "new day lets go",
  'pa_morning':           "morning",
  'pa_welcome_back':      "welcome back",
  'pa_been_a_minute':     "been a min ",
  'pa_need_anything':     "need anything",
  'pa_slow_day':          "slow day thats fine too",
  'pa_its_late':          "its late",
  'pa_past_midnight':     "past midnight",

  // ── audio/misc/ — utility ──────────────────────────────────────────────────
  'misc_done':       "Done",
  'misc_error':      "Something went wrong. Check the terminal for details",
  'misc_wait':       "Give me a second",
  'misc_not_found':  "I didn't find anything for that",
  'misc_running':    "Running",
};

// #225 — the lines the orb still says are re-recorded in the guide's voice
// (orbLines.ts → audio/voice/<id>.mp3): their id is their file name.
for (const id of Object.keys(ORB_LINES)) CLIP_MAP[id] = id;

/** Pool of clips played randomly when the orb is clicked while idle. */
export const CLICK_CLIPS = [
  'click_yes', 'click_aha1', 'click_aha2', 'click_im_here',
  'click_go_ahead', 'click_hey', 'click_listening', 'click_mm',
  'click_sup', 'click_whats_up1', 'click_whats_up2', 'click_yeah',
];
