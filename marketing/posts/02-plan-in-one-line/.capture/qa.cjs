const esbuild=require('/home/user/KRNL0/node_modules/esbuild');
const r=esbuild.buildSync({entryPoints:['/home/user/KRNL0/src/shared/quickAdd.ts'],bundle:true,format:'cjs',write:false,platform:'node'});
const m={exports:{}};new Function('module','exports',r.outputFiles[0].text)(m,m.exports);
const now=new Date('2026-11-24T10:30:00');
for(const s of ['Review the proposal 11:00 1h','Gym 18:00 1h30','Call mom tomorrow at 5pm','Pay rent fri','Essay tue 16:00 by sat','Dentist in 2 hours','Send the invoice','Lunch with Sam 12:30 45m','Buy oat milk tmrw'])console.log(JSON.stringify(s),'=>',JSON.stringify(m.exports.parseQuickAdd(s,now)));
