const {chromium}=require('playwright');const path=require('path');
(async()=>{const root=path.resolve(__dirname,'..');const b=await chromium.launch();const p=await b.newPage({viewport:{width:1080,height:1350},deviceScaleFactor:1});
await p.goto('file://'+root+'/slides.html');await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(500);
for(let i=1;i<=8;i++)await p.locator('#s'+i).screenshot({path:`${root}/slide-${i}.png`});
await b.close()})()
