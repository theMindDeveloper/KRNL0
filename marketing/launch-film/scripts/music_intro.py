"""Epic-but-lo-fi intro (0:00-0:24.3) for the film v2; hands off to the lo-fi groove at the drop. Run: python3 music_intro.py <name> <v>"""
import json, os, sys, urllib.request
from pathlib import Path
OUT = Path("/home/user/KRNL0/marketing/film/public/music")
name, v = sys.argv[1], int(sys.argv[2])
P = ["Cinematic lo-fi opening for a startup launch film, instrumental, 84 BPM. 0:00-0:04 deep sub pulse like a slow heartbeat with vinyl crackle; "
     "0:04-0:16 warm Rhodes chords and soft felt piano over the heartbeat kick, a cello line enters; 0:16-0:22 strings and a wide pad swell, "
     "a lo-fi drum fill builds tension, a rising filtered noise riser; 0:22-0:24 short breath; 0:24 big warm downbeat with a deep boom. Epic but intimate, hopeful, not orchestral bombast, no vocals.",
     "Instrumental intro, 84 BPM: a heartbeat-like low kick every beat from the start, dusty vinyl, mellow electric piano chords, slowly building with "
     "warm strings and a soft choir pad, epic and emotional yet lo-fi and calm, crescendo into a riser that peaks at 0:24 on a single deep impact, then a short tail. No vocals."]
body = {"prompt": P[v], "music_length_ms": 30000, "model_id": "music_v1", "force_instrumental": True}
req = urllib.request.Request("https://api.elevenlabs.io/v1/music?output_format=mp3_44100_192", data=json.dumps(body).encode(),
    headers={"xi-api-key": os.environ.get("ELEVENLABS_API_KEY", "proxy-injected"), "Content-Type": "application/json"})
with urllib.request.urlopen(req, timeout=900) as r: data = r.read()
(OUT / f"{name}.mp3").write_bytes(data); print(name, len(data))
