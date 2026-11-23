"""Crops each captured window to its opaque rectangle (drops the empty margin around it); rounded corners stay transparent."""
import sys
from pathlib import Path
import numpy as np
from PIL import Image
A = Path(__file__).resolve().parent.parent / "assets"
for f in sorted(A.glob("*.png")):
    im = Image.open(f).convert("RGBA"); a = np.array(im)[:, :, 3]
    ys, xs = np.where(a >= 250)
    box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
    im = im.crop(box); px = np.array(im); px[px[:, :, 3] < 60] = 0; Image.fromarray(px).save(f)   # faint scrim remnants in the rounded corners -> fully transparent
    print(f.name, im.size, "->", (box[2] - box[0], box[3] - box[1]))
