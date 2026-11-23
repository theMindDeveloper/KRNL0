const {open}=require('./lib.cjs');
(async()=>{const {b,p,fit}=await open({w:1080,h:800});
await fit(['mother-todo','c-s1','mother-calendar']);
console.log(await p.evaluate(()=>{const t=document.querySelector('.react-flow__viewport').style.transform;return t+'\n'+[...document.querySelectorAll('.react-flow__node')].map(n=>{const r=n.getBoundingClientRect();return n.dataset.id+' '+Math.round(r.x)+','+Math.round(r.y)+' '+Math.round(r.width)+'x'+Math.round(r.height)+' vis='+getComputedStyle(n).visibility}).slice(0,8).join('\n')}));
await b.close()})()
