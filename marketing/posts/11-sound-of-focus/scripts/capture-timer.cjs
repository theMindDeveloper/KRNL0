// The real Timer window (whole), transparent corners — for the "press start" slide.
const {chromium}=require('playwright');const path=require('path');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1280,height:900},deviceScaleFactor:3});
await p.addInitScript(()=>{try{localStorage.setItem('krnl0-theme','light')}catch(e){}});
await p.clock.install({time:new Date('2026-11-24T10:30:00')});
await p.addInitScript({content:require('fs').readFileSync(path.join(__dirname,'board.js'),'utf8')});
await p.goto('http://localhost:5201/?fixture=fresh');await p.clock.runFor(5000);await p.waitForTimeout(1500);await p.clock.runFor(3000);
await p.addStyleTag({content:`html,body,#root,.react-flow,.react-flow__renderer,.react-flow__pane{background:transparent!important}[data-testid="topbar"],[data-testid="statusbar"],[data-testid="dock"],[data-testid="dock-layer"],[data-testid="ambient-radio"],.react-flow__minimap,.react-flow__controls,.react-flow__background,.react-flow__node:not([data-id="mother-pomo"]){visibility:hidden!important}`});
await p.evaluate(()=>window.dispatchEvent(new CustomEvent('krnl:fit-nodes',{detail:{nodeIds:['mother-pomo']}})));await p.clock.runFor(1500);
const n=p.locator('.react-flow__node[data-id="mother-pomo"]');console.log(await n.boundingBox());
await n.screenshot({path:path.resolve(__dirname,'..','assets','timer.png'),omitBackground:true});
await p.clock.runFor(200);
await b.close()})()
