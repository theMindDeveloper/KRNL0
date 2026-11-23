// Films the real KRNL0 app for the "your canvas" carousel. Needs the preview: (repo root) npx vite --config vite.preview.config.ts
// Writes transparent PNGs to ../shots (shadows are added in CSS on the slides).
const {open}=require('./lib.cjs');const path=require('path');
const OUT=path.join(__dirname,'..','shots');
const only=process.argv.slice(2);const want=(n)=>!only.length||only.includes(n);
const HID=(ids)=>ids.map(i=>`.react-flow__node[data-id="${i}"]{visibility:hidden!important}`).join('');
const DOCKHIDE='[data-testid="dock"],[data-testid="dock-layer"]{opacity:0!important}';
const NOTES=['c-s1','c-s2','c-t1','c-r1','c-s3'];
(async()=>{
 // hero: Todos + a handful of different things around it (Todos window whole, nothing cropped)
 if(want('hero')){const {b,p,fit}=await open({w:1100,h:620,dpr:1.5,extraCss:DOCKHIDE+HID(['frame-notes','f-title','f1','f2','f3'])});
  await fit(['mother-todo','c-s3','c-t1']);await p.screenshot({path:OUT+'/hero.png',omitBackground:true});await b.close();}
 // beside: the plan with two notes next to it
 if(want('beside')){const {b,p,fit}=await open({w:1000,h:620,dpr:1.5,extraCss:DOCKHIDE+HID(['c-r1','c-s3','c-t1','frame-notes','f-title','f1','f2','f3'])});
  await fit(['mother-todo','c-s1','c-s2']);await p.screenshot({path:OUT+'/beside.png',omitBackground:true});await b.close();}
 // dock: the real toolbar
 if(want('dock')){const {b,p}=await open({w:700,h:700,dpr:3});
  const el=p.locator('[data-testid="dock"]').first();await el.screenshot({path:OUT+'/dock.png',omitBackground:true});await b.close();}
 // frame: a frame with its notes
 if(want('frame')){const {b,p,fit}=await open({w:760,h:760,dpr:1.5,extraCss:DOCKHIDE});
  await fit(['frame-notes']);await p.screenshot({path:OUT+'/frame.png',omitBackground:true});await b.close();}
 // layout menu (real)
 if(want('menu')){const {b,p}=await open({w:1400,h:900,dpr:3,hide:false});
  await p.click('[data-testid="layout-menu"]');await p.clock.runFor(600);await p.waitForTimeout(300);
  await p.locator('[data-testid="layout-menu-list"]').screenshot({path:OUT+'/menu.png',omitBackground:true});await b.close();}
 // free canvas (Todos + notes) and My layout (the Station)
 if(want('free')){const {b,p,fit}=await open({w:700,h:700,dpr:1.5,extraCss:DOCKHIDE+HID(['frame-notes','f-title','f1','f2','f3'])});
  await fit(['mother-todo','c-s3','c-t1']);await p.screenshot({path:OUT+'/free.png',omitBackground:true});await b.close();}
 if(want('station')){const {b,p,fit}=await open({w:1200,h:1000,dpr:1.25,mode:'station',keep:['calendar'],extraCss:DOCKHIDE});
  await p.screenshot({path:OUT+'/station.png',omitBackground:true});await b.close();}
})();
