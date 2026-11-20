const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {createDomainLoader}=require('./load-domain.cjs');
const load=createDomainLoader();
const m=load('src/music.ts'),sustain=load('src/sampleSustain.ts');
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
 assert.ok(app.includes("audioEngine.value==='samples'&&!bowedViolin&&!needsSustainingSynth(inst,duration)"));
 assert.ok(app.includes("instrumentSynth(inst).triggerAttackRelease"));
 assert.ok(app.includes("sampler.triggerAttackRelease"));
 assert.ok(app.includes('playbackDuration(event.durationSeconds,rehearsalSpeed.value)'));
 assert.ok(app.includes('captureKeySynth?.triggerRelease('));
 assert.ok(app.includes('ensureCaptureKeySynth().triggerAttack('));
 assert.ok(app.includes('sustain:0.85,release:0.25'));
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
