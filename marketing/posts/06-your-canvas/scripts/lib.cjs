// Shared bits for the capture scripts: opens the real app preview (fake clock, demo board), hides the app chrome
// and makes the canvas transparent so windows can be placed on any slide colour (shadows are added in CSS).
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');
const HIDE=`[data-testid="ambient-radio"],[data-testid="topbar"],[data-testid="statusbar"],[data-testid="orb-button"],[data-testid="station-toolbar"],.react-flow__minimap,.react-flow__controls,.react-flow__background,.react-flow__attribution{display:none!important}
 .react-flow__node[data-id="mother-clock"],.react-flow__node[data-id="mother-analytics"],.react-flow__node[data-id="mother-term"],.react-flow__node[data-id="mother-pomo"],.react-flow__node[data-id="mother-habit"]{visibility:hidden!important}
 html,body,#root,.react-flow,.react-flow__renderer,.react-flow__pane{background:transparent!important}
 .react-flow__edges,.react-flow__edge{display:none!important} *{caret-color:#c9f158}`;
async function open({w,h,dpr=1.5,mode='free',hide=true,extraCss=''}){
  const b=await chromium.launch();const p=await b.newPage({viewport:{width:w,height:h},deviceScaleFactor:dpr});
  p.on('pageerror',e=>console.log('PE',e.message.slice(0,200)));
  await p.clock.install({time:new Date('2026-11-24T10:30:00')});
  await p.addInitScript({content:`window.__MODE__=${JSON.stringify(mode)};`});
  await p.addInitScript({content:fs.readFileSync(path.join(__dirname,'board.js'),'utf8')});
  await p.goto('http://localhost:5201/?fixture=fresh');await p.clock.runFor(5000);await p.waitForTimeout(1200);await p.clock.runFor(4000);
  await p.addStyleTag({content:(hide?HIDE:'')+extraCss});
  await p.evaluate(()=>{for(const e of document.querySelectorAll('div,section')){const r=e.getBoundingClientRect();if(/^\s*Good morning/.test(e.textContent||'')&&r.height<80&&r.height>20)e.style.display='none'}});
  const fit=async(ids,ms=1400)=>{await p.evaluate(ids=>window.dispatchEvent(new CustomEvent('krnl:fit-nodes',{detail:{nodeIds:ids}})),ids);await p.clock.runFor(ms);await p.waitForTimeout(250);};
  return {b,p,fit};
}
module.exports={open,HIDE};
