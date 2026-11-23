"""Narration for the launch film, ElevenLabs Eleven v4, male voice. Key is proxy-injected in the cloud session
(ELEVENLABS_API_KEY on your own machine). Output: assets/voice/<id>.mp3 + .json (word timings). Run: python3 scripts/voice.py [id ...]"""
import base64, json, os, re, sys, urllib.request
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
VOICE = "pn8ABB5WQQBNyhFA5uEG"
MODEL = "eleven_v4"
LINES = {
 "p1": "[low, calm] Every morning starts the same. A list in one app. A calendar in another. A timer. A habit tracker. A dozen tabs open. [sighs] And none of them know about each other.",
 "p2": "[quietly] What if they did?",
 "r1": "[confident, deep] This is KRNL0. Kernel Zero. One canvas, for your whole day.",
 "pl": "[calm] Start with the plan. Type it the way you'd say it. Review the proposal, eleven, one hour. [pause] Done. It's planned, it's timed, it's on your calendar. [warm] No time yet? Pick it up, and drop it where it belongs.",
 "fo": "[confident] Then, do the work. Press start, and every minute lands on the plan it belongs to. [soft] Put on a sound that keeps you in it. Rain. A low hum. A fire. Mix them. Make your own room.",
 "lb": "[warm] Build the habits that hold the day together. Tick them off. Watch the streak grow. [serious] And at the end of the day, the truth. Planned, against spent. Not what you meant to do. What you did.",
 "yo": "[confident] Everything lives on a canvas that's yours. Notes. Pictures. Frames to hold a week of thinking. Tidy when you want. Free when you don't. [calm] Prefer the keyboard? Every button is also a command. And when you'd rather just ask, ask. The assistant works on your real board.",
 "tu": "[warm] New here? The guided tours show you around, with real actions, in the real app. Two minutes, and you're in.",
 "en": "[low, confident] One canvas. Your whole day. [pause] KRNL0. [calm] Free. No account. Yours, on your computer. Download it today.",
}
def tts(text):
    key = os.environ.get("ELEVENLABS_API_KEY", "proxy-injected")
    req = urllib.request.Request(f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE}/with-timestamps?output_format=mp3_44100_128",
        data=json.dumps({"text": text, "model_id": MODEL}).encode(),
        headers={"xi-api-key": key, "Content-Type": "application/json", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=240) as r: return json.loads(r.read())
def words_from(al):
    chars=al["characters"]; st=al["character_start_times_seconds"]; en=al["character_end_times_seconds"]; text="".join(chars); out=[]
    for m in re.finditer(r"\[[^\]]*\]|[^\s\[\]]+", text):
        if m.group().startswith("["): continue
        out.append({"w": m.group(), "s": round(st[m.start()],3), "e": round(en[m.end()-1],3)})
    return out
if __name__ == "__main__":
    want = sys.argv[1:] or list(LINES)
    (ROOT/"assets/voice").mkdir(parents=True, exist_ok=True)
    for k in want:
        d = tts(LINES[k])
        (ROOT/f"assets/voice/{k}.mp3").write_bytes(base64.b64decode(d["audio_base64"]))
        al = d.get("normalized_alignment") or d["alignment"]; w = words_from(al)
        (ROOT/f"assets/voice/{k}.json").write_text(json.dumps({"text": LINES[k], "words": w}, indent=1))
        print(k, len(w), "words, ends", w[-1]["e"])
