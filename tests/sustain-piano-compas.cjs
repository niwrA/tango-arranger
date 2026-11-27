const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {createDomainLoader}=require('./load-domain.cjs');
const load=createDomainLoader();
const m=load('src/music.ts'),sustain=load('src/sampleSustain.ts'),open=load('src/openSampleBanks.ts');
const root=path.resolve(__dirname,'..');
let count=0;function check(name,fn){fn();count++;console.log('PASS '+name);}
check('long acoustic violin notes use a sustaining voice, short pizzicato attacks keep sample',()=>{
 assert.equal(sustain.needsSustainingSynth('Violin I',2.4),true);
 assert.equal(sustain.needsSustainingSynth('Violin II',0.7),true);
 assert.equal(sustain.needsSustainingSynth('Violin I',0.12),false);
 assert.equal(sustain.needsSustainingSynth('Violin I',0),false);
});
check('other sustaining voices have synth fallback; piano remains percussive',()=>{
 for(const inst of ['Bandoneon I','Voice','Flute','Clarinet','Trumpet','Trombone']){
  assert.equal(sustain.needsSustainingSynth(inst,2),true,inst);
 }
 assert.equal(sustain.needsSustainingSynth('Contrabass',1.8),true);
 assert.equal(sustain.needsSustainingSynth('Piano',3),false);
 assert.equal(sustain.needsSustainingSynth('Guitar',3),false);
});
check('sample routing applies only to tone generation; note timing is unchanged',()=>{
 const app=fs.readFileSync(path.join(root,'src/App.vue'),'utf8');
 assert.ok(app.includes("canUseArcoSample(inst,duration)?samplePlayers.get(inst):undefined"));
 assert.ok(app.includes("usesPizzicatoBank(inst,technique)?selectPizzicatoPlayer(inst,velocity)"));
 assert.ok(app.includes("instrumentSynth(inst).triggerAttackRelease"));
 assert.ok(app.includes("sampler.triggerAttackRelease"));
 assert.ok(app.includes('playbackDuration(event.durationSeconds,rehearsalSpeed.value)'));
 assert.ok(app.includes('captureKeySynth?.triggerRelease('));
 assert.ok(app.includes('ensureCaptureKeySynth().triggerAttack('));
 assert.ok(app.includes('renderArrangementNote(inst,note,event,event.durationSeconds/captureSpeed.value'));
});
check('CC0 arco banks use original pitch anchors and bounded finite playback',()=>{
 assert.equal(open.arcoBank('Violin I').urls.E4,'LLVln_ArcoVib_E4_f.wav');
 assert.equal(open.arcoBank('Contrabass').urls['D#1'],'eb1_vl3_down.wav');
 assert.equal(open.arcoBank('Bandoneon I'),undefined);
 assert.equal(open.arcoBank('Piano'),undefined);
 assert.equal(open.openPianoBank('Piano','/').urls['A#0'],'As0.mp3');
 assert.equal(open.openPianoBank('Piano','/app/').baseUrl,'/app/samples/open-piano/');
 assert.equal(open.openPianoBank('Bandoneon I','/'),undefined);
 assert.equal(open.canUseArcoSample('Violin I',1),true);
 assert.equal(open.canUseArcoSample('Violin I',3),false);
 assert.equal(open.canUseArcoSample('Contrabass',2),false);
 assert.equal(open.canUseArcoSample('Violin I',NaN),false);
});
check('the bundled piano manifest and every loader URL are in public assets',()=>{
 const bank=open.openPianoBank('Piano','/app/');
 const publicBank=path.join(root,'public',bank.baseUrl.slice('/app/'.length));
 const manifest=JSON.parse(fs.readFileSync(path.join(publicBank,'manifest.json'),'utf8'));
 assert.equal(manifest.version,1);
 assert.equal(manifest.source,'VCSL Steinway B');
 assert.equal(manifest.license,'CC0-1.0');
 assert.deepEqual(manifest.anchors,Object.keys(bank.urls));
 assert.equal(manifest.anchors.length,14);
 for(const filename of Object.values(bank.urls)){
  assert.ok(fs.statSync(path.join(publicBank,filename)).size>0,filename);
 }
});
check('pizzicato alternates actual recordings and selects soft layers',()=>{
 const p=load('src/pizzicatoSamples.ts');
 assert.equal(p.pizzicatoVariantBank('Violin I','alternate').urls.E4,'LLVln_Pizz_E4_f_RR2.wav');
 assert.equal(p.pizzicatoVariantBank('Violin I','soft').urls.G3,'LLVln_Pizz_G3_p_RR1.wav');
 assert.equal(p.pizzicatoVariantBank('Violin I','soft').urls.C7,'LLVln_Pizz_C7_f.wav');
 assert.equal(p.pizzicatoVariantBank('Contrabass','alternate').urls['D#1'],'eb1_vl3_rr2.wav');
 assert.equal(p.pizzicatoVariantBank('Contrabass','soft').urls['D#1'],'eb1_vl1_rr1.wav');
 assert.equal(p.pizzicatoVariant(.3,0),'soft');
 assert.equal(p.pizzicatoVariant(.8,0),'primary');
 assert.equal(p.pizzicatoVariant(.8,1),'alternate');
});
check('WAV loop metadata uses source sample rate and inclusive end',()=>{
 const {readWavLoop}=load('src/arcoSustain.ts');
 const buffer=new ArrayBuffer(104),v=new DataView(buffer);
 const tag=(p,s)=>{for(let i=0;i<s.length;i++)v.setUint8(p+i,s.charCodeAt(i));};
 tag(0,'RIFF');v.setUint32(4,96,true);tag(8,'WAVE');
 tag(12,'fmt ');v.setUint32(16,16,true);v.setUint32(24,48000,true);
 tag(36,'smpl');v.setUint32(40,60,true);v.setUint32(72,1,true);
 v.setUint32(88,24000,true);v.setUint32(92,47999,true);
 const loop=readWavLoop(buffer);assert.equal(loop.start,.5);assert.equal(loop.end,1);
 assert.equal(readWavLoop(new ArrayBuffer(4)),undefined);
});
check('gesture anchor bounds transposition and rejects insufficient finite tails',()=>{
 const {gestureAnchor}=load('src/arcoSustain.ts');
 const samples=[{pitch:60,seconds:2,loop:false},{pitch:64,seconds:2,loop:true}];
 assert.equal(gestureAnchor([60,64],.5,samples),0);
 assert.equal(gestureAnchor([60,64],5,samples),1);
 assert.equal(gestureAnchor([50,75],.5,samples),undefined);
 assert.equal(gestureAnchor([60],4,[samples[0]]),undefined);
});
function make(beats,profile='traditional'){
 const p=m.blankProject({sections:1,measuresPerSection:2,beats,bpm:120});
 p.profile=profile;
 for(const bar of p.bars){bar.chord='Dm,A7';bar.melody=[];}
 p.roles.A.Piano='chords';p.roles.A.Contrabass='bass';
 p.instrumentSettings.Piano={difficulty:'advanced',activity:1};
 p.instrumentSettings.Contrabass={difficulty:'advanced',activity:1};
 return p;
}
function noteOn(notes,beat){return notes.find(n=>Math.abs(n.start-beat)<1e-7)}
check('piano 88 key range is intact while generated tango bass stays musically focused',()=>{
 assert.deepEqual(Array.from(m.instrumentRange('Piano')),[21,108]);
 for(const pc of [0,2,4,5,7,9,11]){
  const pitch=m.pianoBassReinforcement(pc,40,21,55);
  assert.ok(pitch>=36&&pitch<=55&&pitch%12===pc,String(pc));
 }
});
check('in tango 4/4 piano left hand follows contrabass root/fifth pulses',()=>{
 const p=make(4),score=m.generate(p),split=p.pianoSplitPitch??60;
 const pianoBass=score.Piano.filter(n=>n.pitch<split&&n.start<4);
 const contrabass=score.Contrabass.filter(n=>n.start<4);
 assert.deepEqual(Array.from(pianoBass,n=>n.start),[0,2]);
 for(const beat of [0,2]){
  const piano=noteOn(pianoBass,beat),bass=noteOn(contrabass,beat);
  assert.ok(piano&&bass,'missing bass attack at beat '+beat);
  assert.equal(piano.pitch%12,bass.pitch%12);
  assert.ok(piano.pitch>=36&&piano.pitch<=55);
  assert.ok(piano.pitch>=bass.pitch);
  assert.ok(piano.gate<1);
 }
});
check('milonga adds piano bass strokes at 0/1 with upper offbeat chord replies',()=>{
 const p=make(2,'milonga'),score=m.generate(p),split=p.pianoSplitPitch??60;
 const piano=score.Piano.filter(n=>n.start<2),bass=score.Contrabass.filter(n=>n.start<2);
 const left=piano.filter(n=>n.pitch<split),right=piano.filter(n=>n.pitch>=split);
 assert.deepEqual(Array.from(left,n=>n.start),[0,1]);
 for(const beat of [0,1]){
  assert.equal(noteOn(left,beat).pitch%12,noteOn(bass,beat).pitch%12);
  assert.ok(noteOn(left,beat).gate<1);
 }
 assert.ok(right.some(n=>Math.abs(n.start-.5)<1e-7));
 assert.ok(right.some(n=>Math.abs(n.start-1.5)<1e-7));
});
check('vals keeps single downbeat piano bass aligned with contrabass',()=>{
 const p=make(3),score=m.generate(p),split=p.pianoSplitPitch??60;
 const piano=score.Piano.filter(n=>n.start<3),bass=score.Contrabass.filter(n=>n.start<3);
 const left=piano.filter(n=>n.pitch<split),right=piano.filter(n=>n.pitch>=split);
 assert.equal(left.length,1);
 assert.equal(left[0].start,0);
 assert.equal(left[0].pitch%12,noteOn(bass,0).pitch%12);
 assert.ok(right.length>=2);
});
console.log(count+' sampled sustain and piano bass checks passed');
