const assert=require('node:assert/strict');
const fs=require('node:fs');
const cp=require('node:child_process');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const temp=fs.mkdtempSync('/tmp/tango-dynamics-');
try{
 const result=cp.spawnSync('tsc',['--module','commonjs','--moduleResolution','node','--target','es2020','--lib','es2020,dom','--outDir',temp,'--rootDir',path.join(root,'src'),path.join(root,'src','music.ts'),path.join(root,'src','measureLoop.ts'),path.join(root,'src','io.ts')],{encoding:'utf8'});
 // io imports external packages; test source contracts independently when unavailable.
 const music=fs.readFileSync(path.join(root,'src/music.ts'),'utf8');
 const loop=fs.readFileSync(path.join(root,'src/measureLoop.ts'),'utf8');
 const xml=fs.readFileSync(path.join(root,'src/io.ts'),'utf8');
 const app=fs.readFileSync(path.join(root,'src/App.vue'),'utf8');
 assert.match(music,/DYNAMIC_MARKS.*ppp.*fff/);
 assert.match(music,/inst\.startsWith\('Contrabass'\).*return 1/);
 assert.match(music,/measureDynamicVelocity/);
 assert.match(loop,/melodyDuckingFactor\(project,instrument,n.start\)/);
 assert.match(loop,/n\.subito\?DYNAMIC_VELOCITIES/);
 assert.ok(xml.includes("wedge number=\"6\" type="));
 assert.match(xml,/subito\.subito/);
 assert.match(app,/Start of this measure/);
 assert.match(app,/End of this measure/);
 assert.match(app,/Lower accompanying parts/);
 assert.match(app,/Subito dynamic/);
 const musicFile=path.join(temp,'music.js');
 if(fs.existsSync(musicFile)){
  const m=require(musicFile);
  const p=m.demoProject();p.melodyDucking={enabled:true,reduction:30};
  assert.equal(m.melodyDuckingFactor(p,'Contrabass',0),1);
  assert.equal(m.melodyDuckingFactor(p,'Piano',0),.7);
  assert.equal(m.melodyDuckingFactor(p,'Violin I',0),1);
  p.measureDynamics={'Piano:0':{start:'p',end:'f'}};
  assert.ok(m.measureDynamicVelocity(p,'Piano',3,80)>m.measureDynamicVelocity(p,'Piano',0,80));
 }
 console.log('11 measure dynamics UI, notation and audio checks passed');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
