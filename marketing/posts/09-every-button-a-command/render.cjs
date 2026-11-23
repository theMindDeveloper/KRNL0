const {chromium}=require('playwright');const path=require('path');const fs=require('fs');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1080,height:1350},deviceScaleFactor:1});
for(let n=1;n<=7;n++){await p.goto('file://'+path.join(__dirname,'slides',`slide-${n}.html`));await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(250);
 // flag any text that overflows its box
 const bad=await p.evaluate(()=>[...document.querySelectorAll('.hl .headline,.hl .sub,.cta,.pill,.tiles')].filter(e=>e.scrollWidth>e.clientWidth+1||e.getBoundingClientRect().right>1080-40).map(e=>e.className+':'+e.textContent.slice(0,30)));
 if(bad.length)console.log('slide',n,'overflow?',bad);
 await p.screenshot({path:path.join(__dirname,`slide-${n}.png`)});}
await b.close();console.log('ok')})()
