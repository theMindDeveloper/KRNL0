const {open,ROOT}=require('./lib.cjs');const path=require('path');
(async()=>{const {b,p,ground,fit}=await open();await ground('#a98bf6');await fit(['mother-todo','mother-calendar']);
const out=path.join(ROOT,'.capture');
for(const id of ['mother-todo','mother-calendar']){const bb=await p.locator(`[data-id="${id}"]`).boundingBox();console.log(id,bb);}
await p.screenshot({path:out+'/x0.png'});
await p.evaluate(()=>{const n=document.querySelector('[data-id="mother-todo"]');const t=[...n.querySelectorAll('*')].find(e=>e.children.length===0&&/^add a plan$/i.test((e.textContent||'').trim()));t&&t.click();});
await p.clock.runFor(400);
const inp=p.locator('[data-id="mother-todo"] input').first();
for(const c of 'Review the proposal 11:00 1h'){await inp.press(c==' '?'Space':c);await p.clock.runFor(60);}
await p.clock.runFor(500);await p.screenshot({path:out+'/x1.png'});
await b.close()})()
