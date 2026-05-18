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
  'click_see_you_later': 'click_see_you_later',

  // ── audio/intro/ — welcome tour ────────────────────────────────────────────
  'intro_01': "Welcome to KRNL0. I'm your system assistant. jen",
  'intro_02': "This is your canvas Everything you need to track tasks, habits, timers, calendars — lives right here in one infinite workspace you can see all at once",
  'intro_03': "You can pan around by holding middle-click and dragging, or pinch to zoom. The canvas is yours to arrange however your brain works.",
  'intro_04': "That dock on the left Use it to drop new nodes onto the canvas. Or right-click anywhere to get a quick menu",
  'intro_06': "Down here in the corner — that's me. Click me anytime. Or hold Space to talk",
  'intro_07': "Pick something from the menu and I'll walk you through it",

  // ── audio/flows/focus/ ─────────────────────────────────────────────────────
  'focus_01':    "Alright. Let's lock in",
  'focus_02':    "I'm starting a twenty-five minute focus timer",
  'focus_04':    "The timer is running. I'll let you know when the break kicks in",
  'focus_none':  "I don't see a Pomodoro timer on your board yet. Let me add one",
  'focus_added': "Done. Your timer is ready. Hit start when you are",

  // ── audio/tutorial/ — Tutorial 1: Pomodoro & Tasks ─────────────────────────
  // Cold-open (music choreography)
  'tut1_00a': 'tut1_00a_know_tutorials_are_boring',
  'tut1_00b': 'tut1_00b_ill_make_it_more_fun',
  'tut1_00c': 'tut1_00c_lets_play_some_music',
  // Main script
  'tut1_01': 'tut1_01_hey_again_im_jen',
  'tut1_02': 'tut1_02_this_tutorial_pomo_and_tasks',
  'tut1_03': 'tut1_03_look_at_the_left',
  'tut1_04': 'tut1_04_thats_the_pomodoro_node',
  'tut1_05': 'tut1_05_works_like_any_pomodoro',
  'tut1_06': 'tut1_06_see_the_gear_icon',
  'tut1_07': 'tut1_07_click_it_to_tweak',
  'tut1_08': 'tut1_08_i_know_boring',
  'tut1_09': 'tut1_09_heres_the_twist',
  'tut1_10': 'tut1_10_krnl_combines_pomo_and_todo',
  'tut1_11': 'tut1_11_add_a_new_task',
  'tut1_12': 'tut1_12_call_it_learn_machine_learning',
  'tut1_13': 'tut1_13_give_it_sixty_minutes',
  'tut1_14': 'tut1_14_im_waiting',
  'tut1_15': 'tut1_15_nice_task_spawned',
  'tut1_16': 'tut1_16_now_connect_to_pomo',
  'tut1_17': 'tut1_17_double_click_the_task',
  'tut1_18': 'tut1_18_see_it_turned_green',
  'tut1_19': 'tut1_19_krnl_split_into_sessions',
  'tut1_20': 'tut1_20_lets_make_it_interesting',
  'tut1_21': 'tut1_21_add_a_second_task',
  'tut1_22': 'tut1_22_ninety_minutes',
  'tut1_23': 'tut1_23_im_waiting_again',
  'tut1_24': 'tut1_24_look_a_chain_appeared',
  'tut1_25': 'tut1_25_chain_is_your_day_as_pipeline',
  'tut1_26': 'tut1_26_want_to_see_on_calendar',
  'tut1_27': 'tut1_27_calendar_and_clock_already_there',
  'tut1_28': 'tut1_28_weekly_monthly_yearly',
  'tut1_29': 'tut1_29_switch_to_weekly',
  'tut1_30': 'tut1_30_red_line_is_now',
  'tut1_31': 'tut1_31_drag_first_task_onto_today',
  'tut1_32': 'tut1_32_there_it_is',
  'tut1_33': 'tut1_33_both_tasks_landed_in_order',
  'tut1_34': 'tut1_34_calendar_and_clock_in_sync',
  'tut1_35': 'tut1_35_one_bonus',
  'tut1_36': 'tut1_36_you_can_run_in_parallel',
  'tut1_37': 'tut1_37_right_click_add_parallel',
  'tut1_38': 'tut1_38_call_it_listen_to_music',
  'tut1_39': 'tut1_39_two_tasks_side_by_side',
  'tut1_40': 'tut1_40_thats_the_whole_flow',
  'tut1_41': 'tut1_41_if_youre_lazy_use_ai_terminal',
  'tut1_42': 'tut1_42_but_thats_another_tutorial',
  'tut1_43': 'tut1_43_for_now_go_build_your_day',
  'tut1_wait_take_your_time': 'tut1_wait_take_your_time',
  'tut1_wait_still_here':     'tut1_wait_still_here',
  'tut1_skip_no_worries':     'tut1_skip_no_worries',

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

/** Pool of clips played randomly when the orb is clicked while idle. */
export const CLICK_CLIPS = [
  'click_yes', 'click_aha1', 'click_aha2', 'click_im_here',
  'click_go_ahead', 'click_hey', 'click_listening', 'click_mm',
  'click_sup', 'click_whats_up1', 'click_whats_up2', 'click_yeah',
];
