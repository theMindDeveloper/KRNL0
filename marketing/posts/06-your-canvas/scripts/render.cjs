const {chromium}=require('playwright');const path=require('path');const fs=require('fs');
(async()=>{const root=path.resolve(__dirname,'..');const b=await chromium.launch();const p=await b.newPage({viewport:{width:1080,height:1350},deviceScaleFactor:1});
for(let i=1;i<=7;i++){await p.goto('file://'+root+`/html/slide-${i}.html`);await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(300);await p.screenshot({path:root+`/slide-${i}.png`});}
await b.close();})()
