"""Score for the launch film: ElevenLabs Music (instrumental). Key proxy-injected. Output assets/music/score.mp3. Run: python3 scripts/music.py [name]"""
import json, os, sys, urllib.request
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
name = sys.argv[1] if len(sys.argv) > 1 else "score"
PROMPT = ("Cinematic modern trailer score for a software product launch film, instrumental, 96 BPM, 4/4 steady pulse. "
 "0:00-0:20 sparse and tense: low sub drone, a single soft heartbeat-like pulse, thin piano notes, lots of space, a rising riser into a big hit at 0:20. "
 "0:20-0:45 reveal: warm wide strings and a clean steady pulsing synth bass lock in, hopeful, rhythmic, clear kick on every beat. "
 "0:45-1:50 driving confident groove, tight percussion, plucked synth arpeggios, strings swelling every 4 bars, clear downbeats for cuts. "
 "1:50-2:10 short breakdown, minimal, piano and soft pad. "
 "2:10-2:45 big emotional build to the biggest climax with full orchestra and drums. "
 "2:45-3:00 final resonant hit and a long clean decay ending. No vocals, no spoken words, premium Hans Zimmer meets modern electronic, crisp and clean mix.")
body = {"prompt": PROMPT, "music_length_ms": 185000, "model_id": "music_v1", "force_instrumental": True}
req = urllib.request.Request("https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128", data=json.dumps(body).encode(),
    headers={"xi-api-key": os.environ.get("ELEVENLABS_API_KEY", "proxy-injected"), "Content-Type": "application/json"})
with urllib.request.urlopen(req, timeout=900) as r: data = r.read()
(ROOT/"assets/music").mkdir(parents=True, exist_ok=True)
(ROOT/f"assets/music/{name}.mp3").write_bytes(data); print(name, len(data))
