const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createDomainLoader}=require('./load-domain.cjs');
const root=path.resolve(__dirname,'..');
const load=createDomainLoader();
const music=load('src/music.ts');const io=load('src/io.ts',{'./tempoExpressions':load('src/tempoExpressions.ts'),'./music':music});
let count=0;function test(label,fn){fn();count++;console.log('PASS',label);}
const p=music.blankProject({sections:1,measuresPerSection:4});p.bars.forEach(b=>b.chord='Dm,A7');
p.roles.A.Piano='chords';p.roles.A.Contrabass='bass';p.roles.A['Bandoneon I']='chords';p.roles.A['Bandoneon II']='chords';
p.orchestration.bandoneon.A={'Bandoneon I':{target:'independent',method:'exact'},'Bandoneon II':{target:'independent',method:'exact'}};
p.instrumentSettings.Piano.activity=1;p.instrumentSettings.Contrabass.activity=1;
const score=music.generate(p);
test('UI shows the deployed build ID',()=>{
 const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
 assert.match(pkg.version,/^\d+\.\d+\.\d+$/);
 const app=fs.readFileSync(path.join(root,'src/App.vue'),'utf8');
 assert.match(app,/const appDisplayBuild=appBuildId/);
 assert.match(app,/\{\{appDisplayBuild\}\}/);
 assert.doesNotMatch(app,/prototype 2\.0/);
 const loop=app.slice(app.indexOf('async function toggleRhythmLoop('),app.indexOf('// Live tap recording'));
 assert.match(loop,/renderArrangementNote\(inst,note,event,playbackDuration\(event.durationSeconds,rehearsalSpeed.value\)/);
 const compare=app.slice(app.indexOf('async function auditionRhythmComparison('),app.indexOf('const rhythmMeasures='));
 assert.match(compare,/const inst=rhythmPreviewTarget\.value/);
 assert.match(compare,/triggerInstrument\(inst,pitch,/);
});
test('piano generated lower staff is monophonic and within bass range',()=>{
 const lower=score.Piano.filter(n=>n.pitch<(p.pianoSplitPitch??60));
 assert.ok(lower.length>=2);
 const positions=new Set();for(const n of lower){assert.ok(n.pitch<=55);assert.ok(!positions.has(n.start),`bass chord at ${n.start}`);positions.add(n.start);}
});
test('piano generated upper inversions stay in treble range',()=>{
 const upper=score.Piano.filter(n=>n.pitch>=(p.pianoSplitPitch??60));
 assert.ok(upper.length>=8);assert.ok(new Set(upper.map(n=>n.pitch)).size>=3);
});
test('custom piano split respected by figure generation',()=>{
 const other=music.blankProject({sections:1,measuresPerSection:1});other.bars[0].chord='Dm';other.pianoSplitPitch=65;
 const notes=music.figureMeasure(other,'Piano',0,'chords_up');
 assert.ok(notes.filter(n=>n.pitch>=65).length>=8);
 assert.ok(notes.filter(n=>n.pitch<65).every(n=>n.pitch<=55));
});
test('ensemble notes use the beat grid and compact bandoneon chord durations',()=>{
 for(const inst of ['Piano','Contrabass','Bandoneon I','Bandoneon II']){
  const notes=score[inst];assert.ok(notes.length,inst);
  for(const n of notes){
   assert.equal(n.start*4,Math.round(n.start*4),`${inst} onset ${n.start}`);
   assert.equal(n.duration*4,Math.round(n.duration*4),`${inst} duration ${n.duration}`);
   if(inst.startsWith('Bandoneon')){
    assert.equal(n.duration,0.75,`${inst} compact chord duration`);
    assert.ok(Math.abs(music.noteSoundingDuration(n)-0.504)<1e-8);
   }
  }
 }
});
test('short bass and bandoneon articulation stored as sounding gate',()=>{
 for(const inst of ['Contrabass','Bandoneon I','Bandoneon II']){
  assert.ok(score[inst].some(n=>n.gate!==undefined&&n.gate<0.8),`${inst} has no short gate`);
  assert.ok(score[inst].every(n=>n.duration>=0.5),`${inst} has excessively short written duration`);
 }
});
test('piano figure keeps detached gate and full written duration',()=>{
 const n=score.Piano.find(n=>n.pitch>=60);
 assert.ok(n&&n.gate&&n.gate<1);
 assert.equal(n.duration,1);
 assert.ok(music.noteSoundingDuration(n)<n.duration);
});
test('MusicXML piano staff voices and notation remain valid',()=>{
 const xml=io.exportMusicXml(p,score);
 assert.deepEqual(Array.from(io.validateMusicXmlDurations(xml,4)),[]);
 const part=xml.match(/<part id="P1">([\s\S]*?)<\/part>/)[1];
 assert.match(part,/<staves>2<\/staves>/);assert.match(part,/<clef number="1"><sign>G<\/sign>/);assert.match(part,/<clef number="2"><sign>F<\/sign>/);
 assert.match(part,/<voice>1<\/voice>/);assert.match(part,/<voice>2<\/voice>/);
 for(const id of [1,2,5,6]){
  const block=xml.match(new RegExp(`<part id="P${id}">([\\s\\S]*?)<\\/part>`))[1];
  assert.doesNotMatch(block,/<type>64th<\/type>|<type>32nd<\/type>/,`part ${id} contains artificial micro-rests`);
 }
});
test('manual imported note lengths remain unchanged',()=>{
 const manual={pitch:64,start:0.25,duration:0.75,source:'manual'};
 const updated=music.replaceInstrumentMeasure(p,score,'Piano',0,[manual]);
 assert.equal(updated.importedScore.Piano[0].duration,0.75);
});
test('Vals writes beat-aligned piano and contrabass quarters while preserving sounding releases',()=>{
 const vals=music.blankProject({beats:3,sections:1,measuresPerSection:3});
 vals.bars[1].chord='Am';vals.bars[2].chord='F';
 vals.roles.A.Piano='chords';vals.roles.A.Contrabass='bass';
 vals.instrumentSettings.Piano.activity=1;vals.instrumentSettings.Contrabass.activity=1;
 const actual=music.generate(vals);
 for(const [inst,expected] of [['Piano',[[0,.95*.74],[1,.8*.55],[2,.8*.55]]],['Contrabass',[[0,.82],[2,.85*.58]]]]){
  assert.deepEqual([...new Set(actual[inst].map(n=>n.start))],expected.map(([beat])=>beat+3).concat(expected.map(([beat])=>beat+6)));
  for(const n of actual[inst]){
   assert.equal(n.source,'generated');
   assert.equal(n.duration,1);
   assert.ok(Math.abs(music.noteSoundingDuration(n)-expected.find(([beat])=>beat===n.start%3)[1])<1e-10);
  }
  const xml=io.exportMusicXml(vals,actual,{onlyInstrument:inst});
  assert.match(xml,/<time><beats>3<\/beats><beat-type>4<\/beat-type><\/time>/);
  assert.deepEqual(Array.from(io.validateMusicXmlDurations(xml,3,1)),[]);
  assert.doesNotMatch(xml,/<type>(?:64th|32nd|16th)<\/type>|<tie\b/);
  const attacks=[...xml.matchAll(/<note\b[^>]*>([\s\S]*?)<\/note>/g)].filter(([,block])=>block.includes('<pitch>'));
  assert.equal(attacks.length,actual[inst].length);
  assert.ok(attacks.every(([,block])=>block.includes('<type>quarter</type>')));
 }
});
console.log(`${count} rhythm/piano checks passed`);
