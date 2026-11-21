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
 function sine(frequency,rate=44100,amplitude=0.5,phase=0){
  const samples=new Float32Array(4096);
  for(let i=0;i<samples.length;i++)samples[i]=amplitude*Math.sin(2*Math.PI*frequency*i/rate+phase);
  return samples;
 }
 let cases=0,maxErrorCents=0;
 // Ideal tones verify the tuner's numerical resolution, not accuracy on real
 // voices. Include low voice notes, the original regression pitches and whistles.
 for(const rate of [44100,48000])for(const midi of [44,48,57,69,72,81,93,96]){
  for(const cents of [-25,-10,0,10,25]){
   const targetMidi=midi+cents/100;
   const frequency=440*Math.pow(2,(targetMidi-69)/12);
   const result=detectMonophonicPitch(sine(frequency,rate,0.5,cases%2?0.7:0),rate,32.7,4200);
   const label=`${rate} Hz sample rate, MIDI ${midi}, ${cents} cents`;
   assert.ok(result,label+' undetected');
   const errorCents=Math.abs(result.midi-targetMidi)*100;
   maxErrorCents=Math.max(maxErrorCents,errorCents);
   assert.ok(errorCents<3,`${label}: ${errorCents.toFixed(2)} cents error`);
   assert.equal(Math.round(result.midi),midi,label+' chose the wrong semitone');
   if(cents)assert.equal(Math.sign(result.midi-midi),Math.sign(cents),label+' detuning direction');
   assert.ok(result.clarity>0&&result.clarity<=1,label+' invalid clarity');
   cases++;
  }
 }
 for(const rate of [44100,48000]){
  assert.equal(detectMonophonicPitch(new Float32Array(4096),rate),null);
  assert.equal(detectMonophonicPitch(sine(440,rate,0.001),rate),null);
 }
 assert.equal(detectMonophonicPitch(new Float32Array(4096).fill(0.2),44100),null);
 assert.equal(detectMonophonicPitch(new Float32Array(256),44100),null);
 console.log(`PASS microphone pitch detection: ${cases} tuned/detuned tones; maximum error ${maxErrorCents.toFixed(2)} cents; silence and quiet input rejected`);
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
