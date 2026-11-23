const {chromium}=require('playwright');const fs=require('fs');const path=require('path');
const ROOT=path.resolve(__dirname,'..');
exports.ROOT=ROOT;
exports.open=async function(b,{at='2026-11-24T11:02:00',dsf=2,w=1500,h=1000}={}){
  const p=await b.newPage({viewport:{width:w,height:h},deviceScaleFactor:dsf});
  p.on('pageerror',e=>console.log('PE',e.message.slice(0,160)));
  await p.clock.install({time:new Date(at)});
  await p.addInitScript({content:"try{localStorage.setItem('krnl0-theme','light')}catch(e){}"});
  await p.addInitScript({content:fs.readFileSync(path.join(__dirname,'board.js'),'utf8')});
  await p.goto('http://localhost:5201/?fixture=fresh');await p.clock.runFor(5000);await p.waitForTimeout(1500);await p.clock.runFor(4000);
  await p.addStyleTag({content:`[data-testid="ambient-radio"],[data-testid="topbar"],[data-testid="statusbar"],[data-testid="orb-button"],[data-testid="dock"],[data-testid="dock-layer"],.react-flow__minimap,.react-flow__controls,.react-flow__background{display:none!important}
    html,body,#root,.react-flow,.react-flow__renderer,.react-flow__pane{background:transparent!important}
    .react-flow__edges,.react-flow__edge{display:none!important}`});
  await p.evaluate(()=>{for(const e of document.querySelectorAll('div,section')){const r=e.getBoundingClientRect();if(/^\s*Good morning/.test(e.textContent||'')&&r.height<80&&r.height>20)e.style.display='none'}});
  return p;
};
exports.fit=async function(p,ids){
  for(let k=0;k<2;k++){await p.evaluate(ids=>window.dispatchEvent(new CustomEvent('krnl:fit-nodes',{detail:{nodeIds:ids}})),ids);await p.clock.runFor(900);await p.waitForTimeout(250);await p.clock.runFor(900);}
};
