"""Crops each raw window shot to the opaque window rectangle (drops the baked shadow / spare padding) -> assets/."""
import glob, os
import numpy as np
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.makedirs(f"{ROOT}/assets", exist_ok=True)
for f in sorted(glob.glob(f"{ROOT}/.capture/raw/*.png")):
    im = Image.open(f).convert("RGBA"); a = np.array(im)[:, :, 3]
    rows = np.where((a > 250).sum(1) > a.shape[1] * 0.5)[0]
    cols = np.where((a > 250).sum(0) > a.shape[0] * 0.3)[0]
    box = (cols.min(), rows.min(), cols.max() + 1, rows.max() + 1)
    im.crop(box).save(f"{ROOT}/assets/{os.path.basename(f)}")
    print(os.path.basename(f), im.size, "->", box)
