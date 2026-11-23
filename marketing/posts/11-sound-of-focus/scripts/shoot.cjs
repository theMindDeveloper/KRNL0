const {chromium}=require('playwright');const path=require('path');
(async()=>{const root=path.resolve(__dirname,'..');const b=await chromium.launch();const p=await b.newPage({viewport:{width:1080,height:1350},deviceScaleFactor:1});
for(let i=1;i<=8;i++){await p.goto('file://'+root+`/slide-${i}.html`);await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(200);await p.screenshot({path:root+`/slide-${i}.png`});}
await b.close()})()
