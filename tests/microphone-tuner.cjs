const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'tango-tuner-'));
try{
 const compile=cp.spawnSync(process.execPath,[require.resolve('typescript/bin/tsc'),'--strict','--module','commonjs','--target','es2022','--outDir',tmp,path.join(__dirname,'../src/microphoneTuner.ts')],{encoding:'utf8'});
 assert.ifError(compile.error);
 assert.equal(compile.status,0,compile.stdout+'\n'+compile.stderr);
 const {microphoneTunerReading:read,microphoneTunerPrompt:prompt,microphoneScoreMidi}=require(path.join(tmp,'microphoneTuner.js'));
 let checks=0;
 function check(name,fn){fn();checks++;console.log('PASS '+name);}
 check('tuner measures signed cents against the nearest sounding semitone',()=>{
  const sharp=read(69.12),flat=read(68.87);
  assert.equal(sharp.name,'A');assert.equal(sharp.octave,4);assert.equal(sharp.roundedCents,12);assert.equal(sharp.direction,'Sharp');
  assert.equal(flat.name,'A');assert.equal(flat.roundedCents,-13);assert.equal(flat.direction,'Flat');
  assert.ok(sharp.meterPercent>50&&flat.meterPercent<50);
  assert.equal(read(69).meterPercent,50);assert.equal(read(69).inTune,true);assert.equal(read(69.06).inTune,false);
 });
 check('tuner changes nearest note and octave across semitone boundaries',()=>{
  assert.equal(read(59.49).name,'B');assert.equal(read(59.49).octave,3);assert.equal(read(59.49).roundedCents,49);
  assert.equal(read(59.51).name,'C');assert.equal(read(59.51).octave,4);assert.equal(read(59.51).roundedCents,-49);
 });
 check('recording transpose affects the score preview but preserves sounding note and cents',()=>{
  const up=read(69.12,12),down=read(57.12,-12);
  assert.equal(up.name,'A');assert.equal(up.octave,4);assert.deepEqual(up.score,{name:'A',octave:3});assert.equal(up.roundedCents,12);
  assert.equal(down.octave,3);assert.deepEqual(down.score,{name:'A',octave:4});assert.equal(down.roundedCents,12);
  assert.equal(read(5,12).score,null);
 });
 check('sounding pitches round-trip through combined song and recording transposition',()=>{
  for(const scoreMidi of [44,57,69,81])for(const songShift of [-3,0,2])for(const recordingShift of [-12,0,12]){
   const shift=songShift+recordingShift;
   for(const detuning of [-0.25,0,0.25])assert.equal(microphoneScoreMidi(scoreMidi+shift+detuning,shift),scoreMidi);
  }
  assert.equal(microphoneScoreMidi(5,12),null);
  assert.equal(microphoneScoreMidi(125,-12),null);
  assert.equal(microphoneScoreMidi(NaN,0),null);
 });
 check('missing and invalid estimates do not invent a pitch',()=>{
  for(const input of [null,NaN,Infinity,-Infinity])assert.equal(read(input),null);
  assert.equal(prompt(false,-18,-65),'Start Test microphone or Record');
  assert.equal(prompt(true,-80,-65),'Listening · sing or play one note');
  assert.equal(prompt(true,-18,-65),'Signal detected · no steady pitch');
 });
 console.log(checks+' microphone tuner checks passed');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
