const {open}=require('./lib.cjs');const path=require('path');const OUT=path.join(__dirname,'..','.capture');
(async()=>{let {b,p,fit}=await open({w:760,h:760,dpr:1});
await fit(['frame-notes']);
console.log(await p.evaluate(()=>[...document.querySelectorAll('.react-flow__node')].map(n=>{const r=n.getBoundingClientRect();return n.dataset.id+' '+Math.round(r.x)+','+Math.round(r.y)+' '+Math.round(r.width)+'x'+Math.round(r.height)}).filter(s=>/frame|^f/.test(s)).join('\n')+'\n'+document.querySelector('.react-flow__viewport').style.transform));
await p.screenshot({path:OUT+'/x_f2.png'});await b.close();
({b,p,fit}=await open({w:1200,h:1000,dpr:1,mode:'station',keep:['calendar']}));
await fit(['c-s1','c-s2','c-s3','c-r1','c-t1'],1800);
await p.screenshot({path:OUT+'/x_st2.png'});
await b.close();})()
