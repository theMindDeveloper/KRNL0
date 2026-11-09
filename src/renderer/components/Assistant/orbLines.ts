// The orb's own lines (#225) — what it says, and how it is recorded: `say` is
// the script for ElevenLabs Eleven v4 (audio tags like [warmly]), `text` the
// caption shown. scripts/gen-orb-voice.ts records each into
// Assistant/audio/voice/<id>.mp3 in the same voice as the tours.

export interface OrbLine { say: string; text: string }

export const ORB_LINES: Record<string, OrbLine> = {
  // Greetings when the app opens (Orb/index.tsx pickGreeting).
  intro_01:         { say: "[warmly] Hi! I'm your assistant. [Brief pause] Click me, and I'll show you around.", text: "Hi! I'm your assistant. Click me for a tour." },
  click_hey:        { say: '[casually] Hey.', text: 'hey.' },
  click_sup:        { say: "[playfully] Sup.", text: 'sup.' },
  click_whats_up1:  { say: "[cheerfully] What's up?", text: "what's up?" },
  click_whats_up2:  { say: "[curious] What's up?", text: "what's up?" },
  click_im_here:    { say: "[softly] I'm here.", text: "i'm here." },
  click_yeah:       { say: '[casually] Yeah?', text: 'yeah.' },
  click_aha1:       { say: '[curious] Aha.', text: 'aha.' },
  pa_welcome_back:  { say: "[warmly] Welcome back. [Brief pause] The board's right where you left it.", text: "welcome back. the board's where you left it." },
  pa_been_a_minute: { say: '[playfully] Been a minute.', text: 'been a minute.' },
  pa_need_anything: { say: '[friendly] Need anything?', text: 'need anything?' },
  pa_past_midnight: { say: "[softly] Past midnight. [Brief pause] Whatever this is... it can wait.", text: 'past midnight. whatever this is, it can wait.' },
  pa_morning:       { say: '[cheerfully] Morning!', text: 'morning.' },
  pa_its_late:      { say: "[gently] It's late. [Brief pause] Tomorrow exists.", text: "it's late. tomorrow exists." },
  // Clicking the orb while it is idle (CLICK_CLIPS).
  click_yes:        { say: '[friendly] Yes?', text: 'yes?' },
  click_aha2:       { say: '[thoughtfully] Aha...', text: 'aha.' },
  click_go_ahead:   { say: '[encouraging] Go ahead.', text: 'go ahead.' },
  click_listening:  { say: "[calm] I'm listening.", text: "i'm listening." },
  click_mm:         { say: '[curious] Mm?', text: 'mm?' },
  click_see_you_later: { say: '[playfully] Okay... see you later, then.', text: 'Ok, see you later then.' },
  // The focus session (flows/focusSession.ts).
  focus_01:         { say: "[confidently] Alright. Let's lock in.", text: "Alright. Let's lock in." },
  focus_02:         { say: "[calm] I'm starting a twenty-five minute focus timer.", text: "I'm starting a twenty-five minute focus timer." },
  focus_02_track:   { say: "[calm] I'm starting the timer. It records your time until you stop it.", text: "I'm starting the Pomodoro. It tracks your time until you stop it." },
  focus_03:         { say: '[softly] Close your other tabs. [Brief pause] This is your time.', text: 'Close your other tabs. This is your time.' },
  focus_none:       { say: "[friendly] I don't see a timer on your board yet. [Brief pause] Let me add one.", text: "I don't see a Pomodoro timer on your board yet. Let me add one." },
  focus_added:      { say: '[pleased] Done. Your timer is ready... press start when you are.', text: 'Done. Your timer is ready. Hit start when you are.' },
  // The Commander (planning a session).
  cmd_open:         { say: '[confidently] Commander online.', text: 'Commander online.' },
  cmd_got_it:       { say: '[friendly] Got it. Setting that up now.', text: 'Got it. Setting that up now.' },
  cmd_more:         { say: '[curious] What are you planning?', text: 'What are you planning?' },
  cmd_locked:       { say: '[pleased] Session locked in.', text: 'Session locked in.' },
  // Short replies.
  misc_done:        { say: '[pleased] Done.', text: 'Done' },
  misc_error:       { say: '[apologetic] Something went wrong. [Brief pause] Check the terminal for details.', text: 'Something went wrong. Check the terminal for details' },
  misc_wait:        { say: '[calm] Give me a second.', text: 'Give me a second' },
  misc_not_found:   { say: "[thoughtfully] I didn't find anything for that.", text: "I didn't find anything for that" },
  misc_running:     { say: '[casually] Running.', text: 'Running' },
};
