// Renders slides.html -> slide-1..N.png (1080x1350) + contact-sheet.png
const {chromium}=require('playwright');const path=require('path');const fs=require('fs');
const ROOT=path.resolve(__dirname,'..');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1080,height:1350},deviceScaleFactor:1});
await p.goto('file://'+ROOT+'/slides.html');await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(400);
const n=await p.locator('section.slide').count();
for(let i=1;i<=n;i++){await p.locator('#s'+i).screenshot({path:path.join(ROOT,`slide-${i}.png`)});}
console.log('slides',n);
// contact sheet
const html='<body style="margin:0;background:#111;display:flex;gap:16px;padding:16px">'+Array.from({length:n},(_,i)=>`<img src="slide-${i+1}.png" style="width:360px">`).join('')+'</body>';
fs.writeFileSync(path.join(ROOT,'.sheet.html'),html);
const q=await b.newPage({viewport:{width:16+n*376,height:500}});await q.goto('file://'+ROOT+'/.sheet.html');await q.waitForTimeout(300);
await q.screenshot({path:path.join(ROOT,'contact-sheet.png'),fullPage:true});fs.unlinkSync(path.join(ROOT,'.sheet.html'));
await b.close()})()
