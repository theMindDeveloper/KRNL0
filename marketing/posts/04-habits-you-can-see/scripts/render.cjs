const { chromium } = require('playwright'); const path = require('path'); const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
  for (let i = 1; i <= 7; i++) {
    await p.goto('file://' + path.join(ROOT, `slides/slide-${i}.html`)); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(250);
    await p.locator('.slide').screenshot({ path: path.join(ROOT, `slide-${i}.png`) });
  }
  // overflow check: any text node wider/taller than the slide?
  await b.close();
  const { execFileSync } = require('child_process');
  execFileSync('python3', ['-c', `
from PIL import Image
ims=[Image.open('${ROOT}/slide-%d.png'%i).convert('RGB') for i in range(1,8)]
w,h=ims[0].size; s=0.4; tw,th=int(w*s),int(h*s)
sheet=Image.new('RGB',(tw*7+8*10,th+20),(20,20,20))
for k,im in enumerate(ims): sheet.paste(im.resize((tw,th)),(10+k*(tw+10),10))
sheet.save('${ROOT}/contact-sheet.png')`]);
  console.log('rendered');
})();
