"""Generates the narration, one line per scene, with ElevenLabs Eleven v4 (audio tags) and word timings.

The key is never read here: in the cloud session the network proxy injects it for api.elevenlabs.io.
On your own machine set ELEVENLABS_API_KEY. Output: assets/voice/<id>.mp3 + assets/voice/<id>.json
(words with start/end seconds). Run: python3 scripts/voice.py [id ...]
"""
import base64, json, os, re, sys, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VOICE = "yj30vwTGJxSHezdAGsv9"          # "Jessa" — the KRNL0 tour voice
MODEL = "eleven_v4"

# Bracketed cues are Eleven v4 audio tags; they shape delivery and are not spoken.
LINES = {
    "hook":  "[curious] Where did your day actually go? [exasperated] Planned in one app, tracked in another. [confident] Kernel Zero puts it all in one place.",
    "say":   "[warm] Type a plan the way you'd say it. Its day, its time, its length. Done.",
    "see":   "[confident] It lands on one calendar, right next to everything else.",
    "run":   "[relaxed] Press start, and the time is recorded on that task. No separate tracker.",
    "truth": "[excited] Then you see the truth. What you planned, against what it really took.",
    "trust": "[warm] It's free. No account. Your plans stay on your computer. [confident] Kernel Zero. Link in bio.",
}


def tts(text):
    key = os.environ.get("ELEVENLABS_API_KEY", "proxy-injected")
    req = urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE}/with-timestamps?output_format=mp3_44100_128",
        data=json.dumps({"text": text, "model_id": MODEL}).encode(),
        headers={"xi-api-key": key, "Content-Type": "application/json", "Accept": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.loads(r.read())


def words_from(alignment):
    chars = alignment["characters"]; st = alignment["character_start_times_seconds"]; en = alignment["character_end_times_seconds"]
    text = "".join(chars)
    out, i = [], 0
    for m in re.finditer(r"\[[^\]]*\]|[^\s\[\]]+", text):
        if m.group().startswith("["):
            continue
        a, b = m.start(), m.end() - 1
        out.append({"w": m.group(), "s": round(st[a], 3), "e": round(en[b], 3)})
    return out


if __name__ == "__main__":
    want = sys.argv[1:] or list(LINES)
    (ROOT / "assets/voice").mkdir(parents=True, exist_ok=True)
    for k in want:
        d = tts(LINES[k])
        (ROOT / f"assets/voice/{k}.mp3").write_bytes(base64.b64decode(d["audio_base64"]))
        al = d.get("normalized_alignment") or d["alignment"]
        words = words_from(al)
        (ROOT / f"assets/voice/{k}.json").write_text(json.dumps({"text": LINES[k], "words": words}, indent=1))
        print(k, len(words), "words, ends", words[-1]["e"] if words else None)
