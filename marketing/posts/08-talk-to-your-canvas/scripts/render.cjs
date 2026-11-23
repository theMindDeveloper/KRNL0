const {chromium}=require('playwright');const path=require('path');const fs=require('fs');
const ROOT=path.resolve(__dirname,'..');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1080,height:1350},deviceScaleFactor:1});
const only=process.argv[2];
for(let i=1;i<=8;i++){if(only&&Number(only)!==i)continue;await p.goto('file://'+ROOT+`/slides/slide-${i}.html`);await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(250);await p.screenshot({path:`${ROOT}/slide-${i}.png`});}
// contact sheet
const slides=[];for(let i=1;i<=8;i++)slides.push(`<img src="slide-${i}.png" style="width:270px;height:337px">`);
fs.writeFileSync(ROOT+'/.capture/sheet.html',`<body style="margin:0;background:#222;display:flex;flex-wrap:wrap;gap:8px;padding:8px;width:${270*4+8*5}px">${slides.join('').replace(/src="/g,'src="../')}</body>`);
await p.setViewportSize({width:270*4+8*5,height:337*2+8*3});await p.goto('file://'+ROOT+'/.capture/sheet.html');await p.waitForTimeout(400);await p.screenshot({path:ROOT+'/contact-sheet.png'});
await b.close()})()
