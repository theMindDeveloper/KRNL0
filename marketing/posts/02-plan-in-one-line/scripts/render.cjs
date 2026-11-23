// slide-N.html → slide-N.png (1080x1350) + contact-sheet.png + phone-sheet.png (360 px wide each, how it reads on a phone)
const {chromium}=require('playwright');const path=require('path');const fs=require('fs');
const ROOT=path.resolve(__dirname,'..');const N=7;
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1080,height:1350},deviceScaleFactor:1});
for(let i=1;i<=N;i++){await p.goto('file://'+ROOT+`/slide-${i}.html`);await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(300);
  await p.locator('#s').screenshot({path:path.join(ROOT,`slide-${i}.png`)});
  const ov=await p.evaluate(()=>{const bad=[];for(const e of document.querySelectorAll('.headline,.sub,.typed,.row,.chip,.cta')){const r=e.getBoundingClientRect();if(r.right>1080-40||r.left<40)bad.push(e.className+':'+Math.round(r.left)+'-'+Math.round(r.right));}return bad;});
  if(ov.length)console.log('slide',i,'edge warning',ov);}
const mk=async(name,w)=>{const h=Math.round(w*1350/1080);const html=`<body style="margin:0;background:#222;display:flex;gap:10px;padding:10px;width:max-content">${Array.from({length:N},(_,i)=>`<img src="slide-${i+1}.png" style="width:${w}px;height:${h}px">`).join('')}</body>`;
  fs.writeFileSync(path.join(ROOT,'.capture/sheet.html'),html.replace(/src="/g,'src="../'));await p.setViewportSize({width:N*(w+10)+10,height:h+20});await p.goto('file://'+ROOT+'/.capture/sheet.html');await p.waitForTimeout(400);await p.screenshot({path:path.join(ROOT,name)});};
await mk('contact-sheet.png',420);await mk('.capture/phone-sheet.png',360);await b.close();console.log('rendered');})()
