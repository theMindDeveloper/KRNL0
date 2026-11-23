// Screenshots slides/slide-N.html -> ../slide-N.png (1080x1350) and builds contact-sheet.png + a phone-size sheet.
const {chromium}=require('playwright');const path=require('path');const fs=require('fs');
const ROOT=path.resolve(__dirname,'..'), N=8;
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1080,height:1350},deviceScaleFactor:1});
for(let i=1;i<=N;i++){await p.goto('file://'+path.join(ROOT,'slides',`slide-${i}.html`));await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(300);
  await p.locator('#s').screenshot({path:path.join(ROOT,`slide-${i}.png`)});}
const mk=async(w,name)=>{const h=Math.round(w*1350/1080);
  fs.writeFileSync(path.join(ROOT,'.capture','sheet.html'),`<body style="margin:0;background:#222;display:flex;gap:16px;padding:16px;width:max-content">${Array.from({length:N},(_,i)=>`<img src="../slide-${i+1}.png" style="width:${w}px;height:${h}px">`).join('')}</body>`);
  const q=await b.newPage({viewport:{width:N*(w+16)+16,height:h+32}});await q.goto('file://'+path.join(ROOT,'.capture','sheet.html'));await q.waitForTimeout(400);await q.screenshot({path:path.join(ROOT,name)});await q.close();};
await mk(360,'contact-sheet.png');
await b.close()})()
