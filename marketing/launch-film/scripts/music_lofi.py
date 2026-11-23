"""Lo-fi score for the film v2 (ElevenLabs Music, instrumental). Run: python3 music_lofi.py <name> <variant>"""
import json, os, sys, urllib.request
from pathlib import Path
OUT = Path("/home/user/KRNL0/marketing/film/public/music")
name, v = sys.argv[1], int(sys.argv[2])
BASE = ("Instrumental lo-fi chillhop for a calm, premium product film. 84 BPM, steady swing, 4/4. Warm Rhodes electric piano chords, "
        "soft dusty boom-bap drums with a gentle side-chained kick, round mellow bass, subtle vinyl crackle and tape warmth, a soft "
        "plucked guitar motif, airy pads. Clean, modern, optimistic, cosy and focused, never epic, no big orchestral hits, no vocals. ")
FORM = [
  "Structure: 0:00-0:12 only filtered Rhodes and crackle, very sparse and intimate; 0:12-0:36 drums enter softly with a low-pass filter "
  "that slowly opens; 0:36-0:39 a short pause, one breath of silence; 0:39 the full warm groove drops in with bass and open drums; "
  "1:30-1:52 a soft breakdown, drums out, Rhodes and guitar only; 1:52-2:30 the groove returns, fuller, a light melodic lead; "
  "2:30-2:48 settles on a resolved warm chord and fades with crackle.",
  "Structure: gentle intro with crackle and soft keys for 12 seconds, drums fade in under a filter until 0:36, a one-beat stop at 0:37, "
  "the main lo-fi beat lands at 0:39 and grooves, a quiet stripped breakdown from 1:30 to 1:52, the beat returns warmer and brighter "
  "until 2:30, then a soft resolved ending that fades out by 2:48.",
  "Structure: 0:00-0:10 soft Rhodes chords with vinyl crackle; at 0:10 a steady dusty boom-bap beat starts and keeps going all the way, "
  "clear kick and snare on every bar, never stopping for more than one beat. At 0:37 the drums drop out for exactly one bar, then at 0:39 "
  "the full groove returns with bass. From 1:30 to 1:50 lighter drums (hi-hats and rim only) under Rhodes, still in time. From 1:50 the full "
  "beat returns with a warm guitar lead until 2:40, then a soft final chord and crackle until 2:48.",
  "Structure: a constant, clearly audible 84 BPM lo-fi hip hop drum groove from 0:08 to 2:40 with no gaps or silences longer than one beat; "
  "intro of Rhodes and crackle for 8 seconds; a filter sweep opens at 0:36 and the bass enters at 0:39; slightly lighter but still rhythmic "
  "around 1:30 to 1:50; warmer melody from 1:50; a gentle resolved ending from 2:40 to 2:48.",
][v]
body = {"prompt": BASE + FORM, "music_length_ms": 170000, "model_id": "music_v1", "force_instrumental": True}
req = urllib.request.Request("https://api.elevenlabs.io/v1/music?output_format=mp3_44100_192", data=json.dumps(body).encode(),
    headers={"xi-api-key": os.environ.get("ELEVENLABS_API_KEY", "proxy-injected"), "Content-Type": "application/json"})
with urllib.request.urlopen(req, timeout=900) as r: data = r.read()
OUT.mkdir(parents=True, exist_ok=True); (OUT / f"{name}.mp3").write_bytes(data); print(name, len(data))
