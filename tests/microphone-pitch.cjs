const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const cp=require('node:child_process');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'tango-mic-'));
try{
 const result=cp.spawnSync(process.execPath,[require.resolve('typescript/bin/tsc'),'--strict','--module','commonjs','--target','es2022','--lib','es2022,dom','--outDir',tmp,path.join(__dirname,'../src/microphonePitch.ts')],{encoding:'utf8'});
 assert.ifError(result.error);
 assert.equal(result.status,0,result.stdout+'\n'+result.stderr);
 const {detectMonophonicPitch}=require(path.join(tmp,'microphonePitch.js'));
 const rate=44100;
 function sine(frequency,amplitude=0.5){const samples=new Float32Array(4096);for(let i=0;i<samples.length;i++)samples[i]=amplitude*Math.sin(2*Math.PI*frequency*i/rate);return samples;}
 for(const [frequency,midi] of [[220,57],[440,69],[523.25,72],[880,81]]){
  const result=detectMonophonicPitch(sine(frequency),rate);
  assert.ok(result,frequency+' Hz undetected');
  assert.ok(Math.abs(result.midi-midi)<0.6,frequency+' Hz returned '+result.midi);
 }
 assert.equal(detectMonophonicPitch(new Float32Array(4096),rate),null);
 assert.equal(detectMonophonicPitch(sine(440,0.001),rate),null);
 console.log('PASS microphone pitch detection: sine pitches and silence');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
