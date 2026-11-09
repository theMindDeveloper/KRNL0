// The orb's own lines (#225) — what it says, and how it is recorded: `say` is
// the script for ElevenLabs Eleven v4 in plain words (no mood tags, no pauses,
// no trailing "...": they make the voice drop), `text` the caption shown. scripts/gen-orb-voice.ts records each into
// Assistant/audio/voice/<id>.mp3 in the same voice as the tours.

export interface OrbLine { say: string; text: string }

export const ORB_LINES: Record<string, OrbLine> = {
  // Greetings when the app opens (Orb/index.tsx pickGreeting).
  intro_01:         { say: "Hi! I'm your assistant. Click me, and I'll show you around.", text: "Hi! I'm your assistant. Click me for a tour." },
  click_hey:        { say: "Hey!", text: 'hey.' },
  click_sup:        { say: "Sup?", text: 'sup.' },
  click_whats_up1:  { say: "What's up?", text: "what's up?" },
  click_whats_up2:  { say: "What's up?", text: "what's up?" },
  click_im_here:    { say: "I'm here!", text: "i'm here." },
  click_yeah:       { say: "Yeah?", text: 'yeah.' },
  click_aha1:       { say: "Aha?", text: 'aha.' },
  pa_welcome_back:  { say: "Welcome back! The board's right where you left it.", text: "welcome back. the board's where you left it." },
  pa_been_a_minute: { say: "Been a minute!", text: 'been a minute.' },
  pa_need_anything: { say: "Need anything?", text: 'need anything?' },
  pa_past_midnight: { say: "Past midnight. Whatever this is, it can wait.", text: 'past midnight. whatever this is, it can wait.' },
  pa_morning:       { say: "Morning!", text: 'morning.' },
  pa_its_late:      { say: "It's late. Tomorrow exists.", text: "it's late. tomorrow exists." },
  // Clicking the orb while it is idle (CLICK_CLIPS).
  click_yes:        { say: "Yes?", text: 'yes?' },
  click_aha2:       { say: "Aha?", text: 'aha.' },
  click_go_ahead:   { say: "Go ahead!", text: 'go ahead.' },
  click_listening:  { say: "I'm listening!", text: "i'm listening." },
  click_mm:         { say: "Mm?", text: 'mm?' },
  click_see_you_later: { say: "Okay, see you later then!", text: 'Ok, see you later then.' },
  // The focus session (flows/focusSession.ts).
  focus_01:         { say: "Alright! Let's lock in.", text: "Alright. Let's lock in." },
  focus_02:         { say: "I'm starting a twenty-five minute focus timer.", text: "I'm starting a twenty-five minute focus timer." },
  focus_02_track:   { say: "I'm starting the timer. It records your time until you stop it.", text: "I'm starting the Pomodoro. It tracks your time until you stop it." },
  focus_03:         { say: "Close your other tabs. This is your time.", text: 'Close your other tabs. This is your time.' },
  focus_none:       { say: "I don't see a timer on your board yet. Let me add one!", text: "I don't see a Pomodoro timer on your board yet. Let me add one." },
  focus_added:      { say: "Done! Your timer is ready. Press start when you are.", text: 'Done. Your timer is ready. Hit start when you are.' },
  // The Commander (planning a session).
  cmd_open:         { say: "Commander online!", text: 'Commander online.' },
  cmd_got_it:       { say: "Got it! Setting that up now.", text: 'Got it. Setting that up now.' },
  cmd_more:         { say: "What are you planning?", text: 'What are you planning?' },
  cmd_locked:       { say: "Session locked in!", text: 'Session locked in.' },
  // Short replies.
  misc_done:        { say: "Done!", text: 'Done' },
  // No "check the terminal": Easy has none (D23).
  misc_error:       { say: "Something went wrong. Please try again.", text: 'Something went wrong. Please try again' },
  misc_wait:        { say: "Give me a second.", text: 'Give me a second' },
  misc_not_found:   { say: "I didn't find anything for that.", text: "I didn't find anything for that" },
  misc_running:     { say: "Running!", text: 'Running' },
};
