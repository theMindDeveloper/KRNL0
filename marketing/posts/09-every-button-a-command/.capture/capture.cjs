// Films the real app for post 09: the Terminal (typing real krnl commands), plus the Todos/Calendar/Habits/Timer windows
// that those commands change. Usage: node capture.cjs   (preview must be running on :5201)
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');
const OUT=path.join(__dirname,'shots');fs.mkdirSync(OUT,{recursive:true});
const outputs=JSON.parse(fs.readFileSync(path.join(__dirname,'outputs.json'),'utf8'));
const map={};
for(const o of outputs) map['krnl '+o.cmd.replace(/^(\S+ \S+) (.*)$/,(m,a,b)=>a+' '+b)]=o.message;
// the typed forms (quotes as a person types them) → recorded output
const real=(c)=>outputs.find(o=>o.cmd===c).message;
const OUTMAP={
  'krnl todo add "Review the proposal 11:00 1h"': real('todo add Review the proposal 11:00 1h'),
  'krnl habit done "Morning run"': real('habit done Morning run'),
  'krnl habit streak "Morning run"': real('habit streak Morning run'),
  'krnl cal show': real('cal show'),
  'krnl todo list': real('todo list'),
  // pomo cannot run headlessly (it needs the app's main process); these are the exact strings the command code returns
  'krnl pomo start': 'Pomodoro started',
  'krnl pomo status': 'pomo running — 13m worked, 12m remain',
};
fs.writeFileSync(path.join(__dirname,'outmap.json'),JSON.stringify(OUTMAP,null,1));
(async()=>{
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:1500,height:1000},deviceScaleFactor:2});
p.on('pageerror',e=>console.log('PE',e.message.slice(0,200)));
await p.clock.install({time:new Date('2026-11-24T10:30:00')});
await p.addInitScript({content:'window.__PRE=1;'});
await p.addInitScript({content:fs.readFileSync(path.join(__dirname,'board.js'),'utf8')});
await p.addInitScript({content:`window.__OUT=${JSON.stringify(OUTMAP)};`});
await p.goto('http://localhost:5201/?fixture=fresh');await p.clock.runFor(5000);await p.waitForTimeout(1200);await p.clock.runFor(4000);
await p.addStyleTag({content:`[data-testid="ambient-radio"],[data-testid="topbar"],[data-testid="statusbar"],[data-testid="orb-button"],.react-flow__minimap,.react-flow__controls,.react-flow__background{display:none!important}
  [data-testid="dock"],[data-testid="dock-layer"]{opacity:0!important}
  .react-flow__node[data-id="mother-clock"],.react-flow__node[data-id="mother-analytics"]{visibility:hidden!important}
  html,body,#root,.react-flow,.react-flow__renderer,.react-flow__pane,.react-flow__viewport{background:transparent!important}
  [data-id^="mother-"]{filter:none!important;box-shadow:none!important}`});
await p.evaluate(()=>{for(const e of document.querySelectorAll('div,section')){const r=e.getBoundingClientRect();if(/^\s*Good morning/.test(e.textContent||'')&&r.height<80&&r.height>20)e.style.display='none'}});
const fit=async(id,ms=1200)=>{await p.evaluate(i=>window.dispatchEvent(new CustomEvent('krnl:fit-nodes',{detail:{nodeIds:[i]}})),id);await p.clock.runFor(ms);await p.waitForTimeout(300);};
const shot=async(id,name)=>{await fit(id);const loc=p.locator(`.react-flow__node[data-id="${id}"]`);const bb=await loc.boundingBox();console.log(name,JSON.stringify(bb));await p.screenshot({path:path.join(OUT,name+'.png'),omitBackground:true,clip:bb});};
const type=async(cmd)=>{await p.keyboard.type(cmd,{delay:0});await p.clock.runFor(200);await p.keyboard.press('Enter');await p.clock.runFor(400);await p.waitForTimeout(200);};

// ── windows ──
await shot('mother-calendar','win-calendar');
await shot('mother-todo','win-todos');
await shot('mother-habit','win-habits-before');
// tick today (the result of `krnl habit done "Morning run"`)
await p.evaluate(()=>{const n=document.querySelector('.react-flow__node[data-id="mother-habit"]');const t=[...n.querySelectorAll('button[title]')].find(e=>/Morning run 2026-11-24/.test(e.getAttribute('title')||''));t&&t.click();});
await p.clock.runFor(800);await p.waitForTimeout(300);
await shot('mother-habit','win-habits');
// timer: start a session and let 12 minutes pass
await fit('mother-pomo');
await p.evaluate(()=>{const n=document.querySelector('.react-flow__node[data-id="mother-pomo"]');const t=[...n.querySelectorAll('button')].find(e=>/Start session|Start/.test(e.textContent||''));t&&t.click();});
await p.clock.runFor(1000);
await p.clock.fastForward(12*60*1000);await p.clock.runFor(1500);await p.waitForTimeout(300);
await shot('mother-pomo','win-timer');

// ── terminal ──
await fit('mother-term');
{const bb=await p.locator('.react-flow__node[data-id="mother-term"]').boundingBox();await p.mouse.click(bb.x+bb.width/2,bb.y+bb.height-60);}
await p.clock.runFor(600);
await type('clear');
await type('krnl todo add "Review the proposal 11:00 1h"');
await shot('mother-term','term-add');
await type('clear');
await type('krnl habit done "Morning run"');
await type('krnl habit streak "Morning run"');
await shot('mother-term','term-habit');
await type('clear');
await type('krnl pomo start');
await type('krnl pomo status');
await shot('mother-term','term-timer');
await type('clear');
await type('krnl cal show');
await shot('mother-term','term-cal');
await b.close();console.log('done');
})();
