/**
 * clipMap — maps friendly clip IDs to filename stems (no .mp3).
 * VoicePlayer.ts auto-discovers every mp3 under ./audio/** via import.meta.glob,
 * so the folder location of a clip doesn't matter — only the filename stem does.
 * Add new clips: drop the .mp3 in the right audio/<bucket>/ folder and add a
 * mapping line below.
 */
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

  // ── audio/intro/ — welcome tour ────────────────────────────────────────────
  'intro_01': "Welcome to KRNL0. I'm your system assistant. jen",
  'intro_02': "This is your canvas Everything you need to track tasks, habits, timers, calendars — lives right here in one infinite workspace you can see all at once",
  'intro_03': "You can pan around by holding middle-click and dragging, or pinch to zoom. The canvas is yours to arrange however your brain works.",
  'intro_04': "That dock on the left Use it to drop new nodes onto the canvas. Or right-click anywhere to get a quick menu",
  'intro_06': "Down here in the corner — that's me. Click me anytime. Or hold Space to talk",
  'intro_07': "Pick something from the menu and I'll walk you through it",

  // ── audio/flows/whatNext/ ──────────────────────────────────────────────────
  'work_01':   "Let me scan your board",
  'work_02':   "Alright. I can see your open items",
  'work_03':   "Based on what's here, focus on this one first. It's open and it's been sitting",
  'work_05':   "You've got this",
  'work_none': "Your board looks clear. Nothing open right now. Maybe it's time to add something new",

  // ── audio/flows/summarize/ ─────────────────────────────────────────────────
  'summary_01':     "Here's what I see",
  'summary_tasks':  "You have open tasks on the board",
  'summary_habits': "Your habit tracker is running. Keep your streak going today",
  'summary_done':   "That's the overview. Anything you want to dig into",

  // ── audio/flows/focus/ ─────────────────────────────────────────────────────
  'focus_01':    "Alright. Let's lock in",
  'focus_02':    "I'm starting a twenty-five minute focus timer",
  'focus_04':    "The timer is running. I'll let you know when the break kicks in",
  'focus_none':  "I don't see a Pomodoro timer on your board yet. Let me add one",
  'focus_added': "Done. Your timer is ready. Hit start when you are",

  // ── audio/tutorial/ ────────────────────────────────────────────────────────
  'tut_intro':         "Let's build a tiny project together. Three tasks, chained, dropped on your calendar.",
  'tut_find_todo':     "First  find your Todo node Its the green one Click the plus on it to add a task",
  'tut_task_1':        "Type the first one Review notes. Then press enter.",
  'tut_nice':          "nice",
  'tut_task_2':        "Now another. Write the draft",
  // 'tut_task_3' — not yet recorded; falls back to caption timing
  'tut_chain_now':     "tut_chain_now",  // not yet recorded
  'tut_chain_done':    "See those flowing edges The chain is live. The next task fires when the previous one finishes",
  'tut_drop_it':       "Now grab Review notes and drop it on a calendar slot. KRNL0 will auto-place the rest after it",
  'tut_calendar_look': "tut_calendar_look",  // not yet recorded
  'tut_clock_look':    "Your clock shows the active task too",
  'tut_done':          "That's a real schedule. Made by you, in thirty seconds",
  'tut_waiting':       "Im waiting on you Take your time",
  'tut_still_waiting': "tut_still_waiting",  // not yet recorded
  'tut_skip_ok':       "No worries. We can come back to this",
  // Bonus reaction clip — "That's a chain..." — used when user creates first chain.
  'react_first_chain': "That's a chain. Drop the head into the calendar and the rest follow",

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
  'misc_thinking':   "Let me check that",
  'misc_done':       "Done",
  'misc_error':      "Something went wrong. Check the terminal for details",
  'misc_wait':       "Give me a second",
  'misc_not_found':  "I didn't find anything for that",
  'misc_running':    "Running",
  'misc_bye':        "Got it. I'm here if you need me",
};

/** Pool of clips played randomly when the orb is clicked while idle. */
export const CLICK_CLIPS = [
  'click_yes', 'click_aha1', 'click_aha2', 'click_im_here',
  'click_go_ahead', 'click_hey', 'click_listening', 'click_mm',
  'click_sup', 'click_whats_up1', 'click_whats_up2', 'click_yeah',
];
