const {chromium}=require('playwright');const fs=require('fs');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1500,height:1000}});
p.on('pageerror',e=>console.log('PE',e.message.slice(0,300)));p.on('console',m=>{if(m.type()==='error')console.log('CE',m.text().slice(0,200))});
await p.clock.install({time:new Date('2026-11-24T10:30:00')});
await p.addInitScript({content:fs.readFileSync(__dirname+'/board.js','utf8')});
await p.goto('http://localhost:5201/?fixture=fresh');await p.clock.runFor(5000);await p.waitForTimeout(1200);await p.clock.runFor(4000);
console.log(await p.evaluate(()=>[...document.querySelectorAll('.react-flow__node')].map(n=>n.getAttribute('data-id')+':'+n.className.split(' ').filter(c=>/term|mother/.test(c)).join('.'))));
await p.evaluate(()=>window.dispatchEvent(new CustomEvent('krnl:fit-nodes',{detail:{nodeIds:['mother-term']}})));await p.clock.runFor(1200);await p.waitForTimeout(300);
await p.screenshot({path:'dbg.png'});await b.close()})()
