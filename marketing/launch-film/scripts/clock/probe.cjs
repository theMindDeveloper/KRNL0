const L=require('./lib.cjs');
(async()=>{
 const {b,p}=await L.open({invoice:true,order:['todo','calendar','clock','pomo','habit','analytics','term'],calZoom:5,hr:{start:9,end:19},calSize:[540,620]});
 await L.fit(p,['mother-todo','mother-calendar','mother-clock']);
 await p.screenshot({path:'/tmp/claude-0/-home-user-KRNL0/9c42f94d-524b-5d3a-88bf-f40d159a1509/scratchpad/clk1.png'});
 await L.fit(p,['mother-clock','mother-pomo']);
 await p.screenshot({path:'/tmp/claude-0/-home-user-KRNL0/9c42f94d-524b-5d3a-88bf-f40d159a1509/scratchpad/clk2.png'});
 const info=await p.evaluate(()=>[...document.querySelectorAll('.react-flow__node')].filter(n=>n.dataset.id.startsWith('mother')).map(n=>{const r=n.getBoundingClientRect();return n.dataset.id+' '+[r.x,r.y,r.width,r.height].map(Math.round).join(',')}));
 console.log(info.join('\n'));
 await b.close();
})();
