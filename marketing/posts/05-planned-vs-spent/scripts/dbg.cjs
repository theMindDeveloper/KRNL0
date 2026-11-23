const {chromium}=require('playwright');const fs=require('fs');const path=require('path');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1500,height:1100}});
await p.clock.install({time:new Date('2026-11-24T21:05:00')});
await p.addInitScript({content:`window.__LOGO='';window.__NOSEED=false;window.__VIEW='estimates';window.__SIZE={};window.__SKIP='';`+fs.readFileSync(path.join(__dirname,'board.js'),'utf8')});
await p.goto('http://localhost:5201/?fixture=fresh');await p.clock.runFor(5000);await p.waitForTimeout(1500);
const r=await p.evaluate(async()=>{const b=await window.krnl.boardLoad();return b.nodes.filter(n=>n.kind==='todo.task').map(n=>[n.id,n.state.scheduledFor,n.state.scheduledDurationMin,n.state.done])});
console.log(JSON.stringify(r));await b.close()})()
