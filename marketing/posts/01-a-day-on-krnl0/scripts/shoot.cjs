const {chromium}=require('playwright');const fs=require('fs');const path=require('path');
const ROOT=path.resolve(__dirname,'..');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1080,height:1350},deviceScaleFactor:1});
for(let i=1;i<=8;i++){await p.goto('file://'+path.join(ROOT,'slides',`slide-${i}.html`));await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(250);
  await p.screenshot({path:path.join(ROOT,`slide-${i}.png`)});}
await b.close()})()
