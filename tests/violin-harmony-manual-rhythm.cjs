const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const tmp=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'tango-v36-'));
let checks=0;
function check(description,fn){fn();checks++;console.log('PASS '+description);}
try{
 const result=cp.spawnSync(process.execPath,[require.resolve('typescript/bin/tsc'),'--strict','--module','commonjs','--moduleResolution','node','--target','es2022','--lib','es2022,dom','--outDir',tmp,'--rootDir',path.join(root,'src'),path.join(root,'src','music.ts'),path.join(root,'src','rhythmEditor.ts'),path.join(root,'src','io.ts')],{encoding:'utf8'});
 // io.ts depends on jszip and MIDI packages; domain check is done independently.
 if(result.status!==0){
  const domain=cp.spawnSync(process.execPath,[require.resolve('typescript/bin/tsc'),'--strict','--module','commonjs','--moduleResolution','node','--target','es2022','--lib','es2022,dom','--outDir',tmp,'--rootDir',path.join(root,'src'),path.join(root,'src','music.ts'),path.join(root,'src','rhythmEditor.ts')],{encoding:'utf8'});
  assert.equal(domain.status,0,domain.stdout+'\n'+domain.stderr);
 }
 const m=require(path.join(tmp,'music.js')),r=require(path.join(tmp,'rhythmEditor.js'));
 const p=m.demoProject();p.roles.A1['Violin I']='melody';p.roles.A1['Violin II']='harmony';
 const score=m.generate(p);
 check('Violin II automatically has matching harmony onsets when Violin I has melody',()=>{
  const first=score['Violin I'].filter(n=>n.start<4);
  const second=score['Violin II'].filter(n=>n.start<4);
  assert.ok(first.length>0&&second.length>0);
  assert.deepEqual(second.map(n=>n.start),first.map(n=>n.start));
  assert.ok(second.every((n,i)=>n.pitch<first[i].pitch));
 });
 check('Harmony follows protected Violin I manual note pitch and rhythm',()=>{
  const custom=m.replaceInstrumentMeasure(p,score,'Violin I',0,[{pitch:79,start:0.5,duration:0.75},{pitch:76,start:2.25,duration:1}]);
  const next=m.generate(custom)['Violin II'].filter(n=>n.start<4);
  assert.deepEqual(next.map(n=>n.start),[0.5,2.25]);
  assert.deepEqual(next.map(n=>n.duration),[0.75,1]);
  assert.ok(next[0].pitch<79&&next[1].pitch<76);
 });
 check('No ghost violin harmony when the actual Violin I melody is silent',()=>{
  const clone=m.demoProject();clone.roles.A1['Violin II']='harmony';clone.bars[0].melody=[];
  const next=m.generate(clone)['Violin II'].filter(n=>n.start<4);
  assert.equal(next.length,0);
 });
 check('Protected Violin II notes are not overwritten by role changes',()=>{
  const custom=m.replaceInstrumentMeasure(p,score,'Violin II',0,[{pitch:68,start:0,duration:2}]);
  const merged=m.mergeScores(custom,m.generate(custom));
  assert.deepEqual(merged['Violin II'].filter(n=>n.start<4).map(n=>[n.pitch,n.duration]),[[68,2]]);
 });
 for(const beats of [2,3,4])for(const preset of r.RHYTHM_PRESETS){
  const slots=r.quantizeRhythmPreset(r.rhythmSlots(preset.id,beats,'Violin I'),beats);
  check(`${preset.id} preset fits manual ${beats}/4 sixteenth grid`,()=>{
   assert.deepEqual(r.validateRhythmPattern(slots,beats),slots);
   assert.ok(slots.length>0);
  });
 }
 check('Manual rhythm can add attacks, create rests, move beats and change duration',()=>{
  let slots=[];
  slots=r.addRhythmAttack(slots,4,0);slots=r.addRhythmAttack(slots,4,2);
  slots=r.updateRhythmAttack(slots,4,0,{duration:0.5,accent:true});
  slots=r.updateRhythmAttack(slots,4,1,{beat:2.5,duration:0.25,accent:false});
  assert.deepEqual(slots,[{beat:0,duration:0.5,accent:true},{beat:2.5,duration:0.25,accent:false}]);
 });
 check('Long attacks can be split to insert additional rhythms without a gap',()=>{
  const split=r.splitRhythmAttack([{beat:0,duration:2,accent:true},{beat:2,duration:2,accent:false}],4,0);
  assert.deepEqual(split,[{beat:0,duration:1,accent:true},{beat:1,duration:1,accent:false},{beat:2,duration:2,accent:false}]);
 });
 check('Overlapping, off-grid and out-of-measure attacks are rejected',()=>{
  assert.throws(()=>r.validateRhythmPattern([{beat:0,duration:2,accent:true},{beat:1,duration:1,accent:false}],4),/overlap/);
  assert.throws(()=>r.validateRhythmPattern([{beat:0.33,duration:1,accent:true}],4),/fit the beat grid/);
  assert.throws(()=>r.updateRhythmAttack([{beat:3,duration:1,accent:true}],4,0,{duration:1.25}),/fit the beat grid/);
 });
 check('Edited rhythm applies to chosen instruments without altering chord progression',()=>{
  const before=p.bars.map(b=>b.chord);
  const applied=r.applyRhythmPattern(p,score,{instruments:['Violin I','Violin II'],measures:[0],mode:'rhythm',slots:[{beat:0,duration:0.5,accent:true},{beat:1.5,duration:0.25,accent:false},{beat:3,duration:0.5,accent:true}]});
  assert.equal(applied.updated,2);
  assert.deepEqual(applied.project.bars.map(b=>b.chord),before);
  assert.deepEqual([...new Set(applied.project.generatedScore['Violin I'].filter(n=>n.start<4).map(n=>n.start))],[0,1.5,3]);
  assert.ok(applied.project.protectedBars['Violin I:0']);
  assert.ok(applied.project.protectedBars['Violin II:0']);
  assert.deepEqual([...new Set(m.mergeScores(applied.project,m.generate(applied.project))['Violin I'].filter(n=>n.start<4).map(n=>n.start))],[0,1.5,3]);
 });
 check('Manual rhythm honors protected measures unless overwrite is explicit',()=>{
  const first=r.applyRhythmPattern(p,score,{instruments:['Violin II'],measures:[0],mode:'rhythm',slots:[{beat:0,duration:1,accent:true}]});
  const skip=r.applyRhythmPattern(first.project,first.project.generatedScore,{instruments:['Violin II'],measures:[0],mode:'rhythm',slots:[{beat:1,duration:1,accent:false}]});
  assert.equal(skip.updated,0);assert.equal(skip.skippedProtected,1);
  const replace=r.applyRhythmPattern(first.project,first.project.generatedScore,{instruments:['Violin II'],measures:[0],mode:'rhythm',overwriteProtected:true,slots:[{beat:1,duration:1,accent:false}]});
  assert.equal(replace.updated,1);assert.ok(replace.project.generatedScore['Violin II'].some(n=>n.start===1));
 });
 check('Editable rhythm loop and right-edge controls are wired into the Vue UI',()=>{
  const app=fs.readFileSync(path.join(root,'src/App.vue'),'utf8');
  const css=fs.readFileSync(path.join(root,'src/style.css'),'utf8');
  for(const token of ['toggleRhythmLoop','rhythmResizeDown','rhythmResizeMove','rhythmEdit({duration:','rhythmAddAt(beat)','rhythmDelete','rhythmLoopSound','applyRhythmPattern','rhythm-event-selected','rhythmPattern.value'])assert.ok(app.includes(token),token);
  assert.ok(css.includes('.rhythm-track')&&css.includes('.rhythm-resize-handle'));
  assert.ok(app.includes('project.value.generatedScore=mergeScores(project.value,generate(project.value))'));
 });
 console.log(`${checks} v3.6 duet and manual rhythm assertions passed`);
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
