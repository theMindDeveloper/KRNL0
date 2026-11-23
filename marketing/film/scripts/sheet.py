import sys, glob
from PIL import Image, ImageDraw
fs = sorted(glob.glob("out/qa/f*.png")); cols = 3; W, H = 640, 360
sel = fs if len(sys.argv) < 2 else [f for f in fs if float(sys.argv[1]) * 30 <= int(f[-9:-4]) <= float(sys.argv[2]) * 30]
for p in range(0, len(sel), 12):
    part = sel[p:p + 12]; rows = (len(part) + cols - 1) // cols
    sh = Image.new("RGB", (cols * (W + 4), rows * (H + 4)), (40, 40, 40))
    for i, f in enumerate(part):
        im = Image.open(f).convert("RGB").resize((W, H)); d = ImageDraw.Draw(im)
        d.rectangle([0, 0, 110, 22], fill=(0, 0, 0)); d.text((6, 5), f"{int(f[-9:-4]) / 30:.2f}s", fill=(255, 255, 0))
        # title-safe guide (90%)
        d.rectangle([W * 0.05, H * 0.05, W * 0.95, H * 0.95], outline=(255, 0, 80))
        sh.paste(im, ((i % cols) * (W + 4), (i // cols) * (H + 4)))
    sh.save(f"out/qa/sheet_{p // 12}.jpg", quality=88); print(f"out/qa/sheet_{p // 12}.jpg")
