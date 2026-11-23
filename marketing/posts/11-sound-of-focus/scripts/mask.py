"""Rounds the corners of the window screenshots (the element box also catches a faint square shadow in the corners)."""
from PIL import Image, ImageDraw
from pathlib import Path
A = Path(__file__).resolve().parent.parent / "assets"
for f in sorted(A.glob("radio-*.png")) + [A / "timer.png"]:
    im = Image.open(f).convert("RGBA"); w, h = im.size
    m = Image.new("L", (w * 4, h * 4), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, w * 4 - 1, h * 4 - 1), radius=round(14 * (w / (540 if f.name == 'timer.png' else 300))) * 4, fill=255)
    m = m.resize((w, h), Image.LANCZOS)
    a = im.getchannel("A"); a = Image.composite(a, Image.new("L", (w, h), 0), m)
    im.putalpha(a); im.save(f)
print("masked")
