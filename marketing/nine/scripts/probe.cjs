const {chromium}=require('playwright');const fs=require('fs');const path=require('path');
const LOGO='data:image/png;base64,'+fs.readFileSync(path.resolve(__dirname,'../../../docs/assets/krnl0-instagram-logo.png')).toString('base64');
const OUT=process.argv[2];
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
p.on('pageerror',e=>console.log('PE',e.message.slice(0,160)));
await p.clock.install({time:new Date('2026-11-23T10:02:00')});
await p.addInitScript({content:'window.__LOGO='+JSON.stringify(LOGO)+';'+fs.readFileSync(path.join(__dirname,'board.js'),'utf8')});
await p.goto('http://localhost:5201/?fixture=fresh');await p.clock.runFor(5000);await p.waitForTimeout(1500);await p.clock.runFor(4000);
for(const id of ['mother-todo','mother-calendar','mother-pomo','mother-habit']){
  const el=p.locator(`.react-flow__node[data-id="${id}"]`);console.log(id,await el.boundingBox());
  await el.screenshot({path:`${OUT}/${id}.png`});}
await b.close()})()
