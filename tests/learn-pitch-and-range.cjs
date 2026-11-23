const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const src=fs.readFileSync('src/learnPitch.ts','utf8');
const js=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const m={exports:{}};
new Function('module','exports',js)(m,m.exports);
const {expectedFrequency,deviationCents,sensitivityThresholdDb}=m.exports;
assert.equal(expectedFrequency(69,442),442);
assert.equal(expectedFrequency(69,440),440);
assert.ok(Math.abs(deviationCents(442,69,442))<1e-8);
assert.ok(Math.abs(deviationCents(440,69,442)+7.8514)<0.01);
assert.ok(Math.abs(deviationCents(expectedFrequency(76,442),76,442))<1e-8);
assert.ok(Math.abs(deviationCents(expectedFrequency(76,442)*Math.pow(2,20/1200),76,442)-20)<1e-7);
assert.equal(deviationCents(0,69,442),null);
assert.ok(Math.abs(deviationCents(221,69,442,true))<1e-8);
assert.ok(Math.abs(deviationCents(884,69,442,true))<1e-8);
assert.ok(Math.abs(deviationCents(221,69,442)+1200)<1e-8);
assert.ok(Math.abs(deviationCents(221*2**(14/1200),69,442,true)-14)<1e-8);
assert.ok(Math.abs(deviationCents(expectedFrequency(58,442),69,442,true)-100)<1e-8);
assert.equal(sensitivityThresholdDb(0),-30);
assert.equal(sensitivityThresholdDb(100),-80);
assert.equal(sensitivityThresholdDb(50),-55);
const learn=fs.readFileSync('src/InstrumentLearnView.vue','utf8');
const app=fs.readFileSync('src/App.vue','utf8');
const diagram=fs.readFileSync('src/PerformanceChordDiagram.vue','utf8');
const range=fs.readFileSync('src/MeasureRangeControl.vue','utf8');
assert.match(learn,/const referenceHz=computed\(\(\)=>props.referenceHz\)/);
assert.match(learn,/deviationCents\(frequency.value,targetMidi.value,referenceHz.value,allowAnyOctave.value\)/);
assert.match(learn,/sensitivityThresholdDb\(sensitivity.value\)/);
assert.match(learn,/getUserMedia/);
assert.match(learn,/<MeasureRangeControl[^>]*:measures="measures"/);
assert.match(learn,/class="learn-mic-toggle"/);
assert.match(learn,/class="learn-tuner"/);
assert.match(learn,/name="diagram" :target-pitch="current\?targetPitch\(current\):null"/);
assert.match(app,/:target-pitch="targetPitch"/);
assert.match(diagram,/'is-learn-target':isTargetStop\(string.midi,offset\)/);
assert.match(diagram,/props\.violinPosition\?\.openMidi===openMidi/);
assert.match(diagram,/\.diagram-string-stop\.is-learn-target/);
assert.match(range,/Previous measure range/);
assert.match(range,/Current section/);
assert.match(range,/Entire song/);
assert.match(app,/<MeasureRangeControl[^>]*:measures="project.bars"/);
const {createDomainLoader}=require('./load-domain.cjs');
const load=createDomainLoader();
const {alignLearnTake}=load('src/learnTake.ts');
const expected=[{pitch:69,startBeat:0,durationBeats:1}];
const sung={pitch:57,startBeat:0.06,durationBeats:0.91,intonationCents:14,vibrato:false,supportFrames:12};
assert.equal(alignLearnTake(expected,[sung]).rows[0].pitchMatches,false);
assert.deepEqual(alignLearnTake(expected,[sung],true).rows[0],{kind:'matched',target:expected[0],played:sung,pitchMatches:true});
assert.equal(alignLearnTake(expected,[{...sung,pitch:58}],true).rows[0].pitchMatches,false);
function detection(pitch,startBeat,durationBeats=.5){
 return {pitch,startBeat,durationBeats,intonationCents:0,vibrato:false,supportFrames:4};
}
{
 const targets=[67,69,71,73,74,76,78,79,78,74,73,71].map((pitch,i)=>({pitch,startBeat:i,durationBeats:.75}));
 const detected=targets.filter((_,i)=>i!==4).map(t=>detection(t.pitch,1.35+t.startBeat*1.22,.915));
 detected.splice(7,0,detection(83,1.35+7.6*1.22,.2));
 const result=alignLearnTake(targets,detected);
 assert.ok(Math.abs(result.clock.offsetBeats-1.35)<.01);
 assert.ok(Math.abs(result.clock.tempoScale-1.22)<.01);
 assert.equal(result.rows.filter(r=>r.kind==='matched'&&r.pitchMatches).length,11);
 assert.equal(result.rows.find(r=>r.kind==='missed').target.pitch,74);
 assert.equal(result.rows.find(r=>r.kind==='extra').played.pitch,83);
 assert.equal(detected[0].startBeat,1.35);
}
{
 const targets=[72,72,72,74,75].map((pitch,i)=>({pitch,startBeat:i,durationBeats:1}));
 const result=alignLearnTake(targets,[detection(72,0,2.7),detection(74,3,1),detection(76,4,1)]);
 assert.deepEqual(result.rows.map(r=>r.kind),['matched','unresolved-repeat','unresolved-repeat','matched','matched']);
 assert.equal(result.rows[4].pitchMatches,false);
 assert.equal(result.rows[1].played,result.rows[0].played);
}
{
 const targets=[69,71,72,74].map((pitch,i)=>({pitch,startBeat:i,durationBeats:1}));
 const result=alignLearnTake(targets,[]);
 assert.equal(result.rows.every(r=>r.kind==='missed'),true);
 assert.deepEqual(result.clock,{offsetBeats:0,tempoScale:1});
}
{
 const {practiceFeedbackTimeline,feedbackStatus}=load('src/practiceFeedbackTimeline.ts');
 const rows=[
  {kind:'matched',target:{pitch:70,startBeat:2.5,durationBeats:1},played:detection(71,5.5,2),pitchMatches:false},
  {kind:'unresolved-repeat',target:{pitch:70,startBeat:3.5,durationBeats:.5},played:detection(70,5,4)},
  {kind:'extra',played:detection(74,.5,1)},
  {kind:'missed',target:{pitch:72,startBeat:4,durationBeats:1}},
 ];
 const timeline=practiceFeedbackTimeline(rows,{offsetBeats:1,tempoScale:2},3,2);
 assert.deepEqual(timeline.measures,[-1,0,1]);
 assert.equal(timeline.start,-3);
 assert.equal(timeline.span,9);
 assert.deepEqual(timeline.lanes.detected.find(s=>s.row===0),{row:0,pitch:71,start:2.25,duration:1,status:'wrong'});
 assert.deepEqual(timeline.lanes.expected.find(s=>s.row===0),{row:0,pitch:70,start:2.5,duration:1,status:'wrong'});
 assert.deepEqual(timeline.lanes.expected.map(s=>s.status),['wrong','unresolved-repeat','missed']);
 assert.equal(timeline.lanes.detected.some(s=>s.row===1),false);
 assert.equal(timeline.lanes.detected.find(s=>s.row===2).start,-.25);
 assert.equal(feedbackStatus(rows[3]),'missed');
}
{
 const {practiceRecordingPulse:pulse}=load('src/practiceRecordingPulse.ts');
 assert.deepEqual(pulse(-3,3,6,33),{phase:'count-in',measure:null,beat:1,progress:0});
 assert.deepEqual(pulse(-.25,3,6,33),{phase:'count-in',measure:null,beat:3,progress:.75});
 assert.deepEqual(pulse(0,3,6,33),{phase:'recording',measure:33,beat:1,progress:0});
 assert.deepEqual(pulse(3.5,3,6,33),{phase:'recording',measure:34,beat:1,progress:.5});
 assert.equal(pulse(6,3,6,33).phase,'finish');
}
const {practiceTargets}=load('src/practiceTargets.ts');
const bass={pitch:48,start:0,duration:1};
const middle={pitch:55,start:0,duration:1};
const treble={pitch:72,start:0,duration:1};
const continuation={pitch:75,start:0,duration:1,xmlTieContinuation:true};
const chord=[treble,continuation,bass,middle];
const all=practiceTargets(chord,'Piano',60,'all','highest');
assert.equal(all.targets[0],treble);
assert.equal(all.targets.length,1);
assert.deepEqual(Array.from(all.chords.get(treble)),[48,55,72]);
assert.equal(practiceTargets(chord,'Piano',60,'lower','highest').targets[0],middle);
assert.equal(practiceTargets(chord,'Piano',60,'lower','lowest').targets[0],bass);
const imported={...treble,xmlStaff:2};
assert.equal(practiceTargets([imported,bass],'Bandoneon I',60,'lower','highest').targets[0],imported);
const doubleStop={...middle,gesture:{partner:[{pitch:74}]}};
assert.equal(practiceTargets([doubleStop],'Violin I',60,'all','highest').pitches.get(doubleStop),74);
const {blankProject}=load('src/music.ts');
const {exportMusicXml}=load('src/io.ts');
const {DOMParser}=require('@xmldom/xmldom');
const project=blankProject({sections:1,measuresPerSection:1,beats:4});
const bandoneon=[imported,{...bass,xmlStaff:1}];
const xml=exportMusicXml(project,{'Bandoneon I':bandoneon},{onlyInstrument:'Bandoneon I'});
assert.match(xml,/<staves>2<\/staves>/);
const doc=new DOMParser().parseFromString(xml,'application/xml');
const written=Array.from(doc.getElementsByTagName('note')).filter(note=>note.getElementsByTagName('pitch').length);
assert.deepEqual(written.map(note=>[note.getElementsByTagName('octave')[0].textContent,note.getElementsByTagName('staff')[0].textContent]),[['3','1'],['5','2']]);
console.log('Learn pitch reference, sensitivity, target highlighting and shared range checks passed');
