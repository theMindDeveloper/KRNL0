const {chromium}=require('playwright');const fs=require('fs');const path=require('path');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1200,height:900},deviceScaleFactor:1});
p.on('pageerror',e=>console.log('PE',e.message.slice(0,200)));
await p.clock.install({time:new Date('2026-11-24T10:30:00')});
await p.addInitScript({content:fs.readFileSync(path.join(__dirname,'board.js'),'utf8')});
await p.addInitScript(()=>{window.__orbScript={"What's on my plate today?":[{ev:{type:'tool',label:'krnl todo list'}},{ev:{type:'text',text:'Four things today. '}},{ev:{type:'text',text:'Review the proposal at 11:00.'}},{ev:{type:'done',text:''}}]}});
await p.goto('http://localhost:5201/?fixture=fresh');await p.clock.runFor(5000);await p.waitForTimeout(1500);await p.clock.runFor(4000);
await p.screenshot({path:'.capture/e0.png'});
await p.locator('[data-testid="orb-button"]').click();await p.clock.runFor(800);
await p.screenshot({path:'.capture/e1.png'});
await b.close()})()
