// Renders slides.html to slide-1.png ... slide-7.png (1080x1350) and the contact sheet.
const {chromium}=require('playwright');const path=require('path');const ROOT=path.resolve(__dirname,'..');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1200,height:1500},deviceScaleFactor:1});
await p.goto('file://'+ROOT+'/slides.html');await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(600);
const n=await p.locator('.slide').count();
for(let i=1;i<=n;i++){await p.locator('#s'+i).screenshot({path:`${ROOT}/slide-${i}.png`});}
console.log('slides',n);await b.close()})()
