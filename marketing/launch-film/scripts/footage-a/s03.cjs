const L=require('./lib.cjs');
(async()=>{
const {b,p}=await L.open({calSize:[620,620],hr:{start:9,end:18},calZoom:5,noseed:true});
const R=new L.Recorder(p,'s03');
await L.fit(p,['mother-todo','mother-calendar']);
const center=(r)=>[r.x+r.w/2,r.y+r.h/2];
const orb=await R.rect('[data-testid="orb-button"]');
await R.hold(0.2);
await R.moveTo(...center(orb),0.8);R.mark('orb-click');await R.click();
await R.hold(0.9);R.mark('assistant-open');
const first=await R.rect('[data-testid="orb-tour-first-day"]');
await R.moveTo(...center(first),0.6);await R.hold(0.15);R.mark('start-tour-click');await R.click();
await R.hold(0.2);R.mark('step-1');await R.hold(1.5);
const next=await R.rect('[data-testid="tour-next"]');
await R.moveTo(...center(next),0.5);R.mark('next-click');await R.click();
await R.hold(0.9);R.mark('step-2-type-a-plan');
const add=await R.rect('.todo-add');
await R.moveTo(add.x+add.w*0.3,add.y+add.h/2,0.5);await R.click();
await R.hold(0.15);R.mark('typing');await p.keyboard.insertText('Call Mia 16:00 1h');for(let i=0;i<24;i++)await R.frame();
await R.hold(0.5);R.mark('enter');await p.keyboard.press('Enter');
await R.hold(0.25);R.mark('step-3');await R.hold(1.7);
const d=await R.finish('S03-tour-first-day','Real guided tour "Your first day": cursor clicks the Orb, picks "Start here . Your first day" in the assistant panel, tour step 1 (card + Next), step 2 spotlight ring TYPE on "add a plan" where a real plan "Call Mia 16:00 1h" is typed and added with Enter, step 3 follows. Dark theme, chrome visible. 1280x720 CSS px @2.25 -> 2880x1620.');
console.log('S03 duration',d,JSON.stringify(R.markers));
await b.close()})()
