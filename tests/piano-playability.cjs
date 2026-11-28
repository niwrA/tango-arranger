const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const {createDomainLoader}=require('./load-domain.cjs');
const m=createDomainLoader()('src/music.ts');
let checks=0;
function test(label,fn){fn();checks++;console.log('PASS',label);}
function project(chord='Dm',difficulty='advanced',beats=4,bpm=120){
 const p=m.blankProject({sections:1,measuresPerSection:3,beats,bpm});p.bars.forEach(b=>b.chord=chord);
 p.instrumentSettings.Piano={difficulty,activity:1};p.roles.A.Piano='chords';return p;
}
function assertStacks(notes,p){
 const failures=m.assessPianoPlayability(notes,p).filter(issue=>issue.kind==='span'||issue.kind==='polyphony');
 assert.equal(failures.length,0,JSON.stringify(failures.slice(0,3)));
}
test('A7 old 18-semitone right-hand stack is diagnosed, new figure is playable',()=>{
 const p=project('A7'),bad=[67,81,85].map(pitch=>({pitch,start:3,duration:1}));
 assert.ok(m.assessPianoPlayability(bad,p).some(issue=>issue.kind==='span'));
 assertStacks(m.figureMeasure(p,'Piano',0,'chords_up',0),p);
});
test('chord voicings meet hard spans across 12 roots, qualities and variations',()=>{
 for(const root of ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'])
 for(const quality of ['','m','7','maj7','dim','aug'])
 for(const difficulty of ['easy','intermediate','advanced']){
  const p=project(root+quality,difficulty);
  for(const figure of ['chords_up','chords_down'])
  for(const variation of [0,1,2,4,6,8,10,13,19]){
   const notes=m.figureMeasure(p,'Piano',0,figure,variation);
   assertStacks(notes,p);
   assert.ok(notes.some(n=>n.pitch>=60),root+quality);
  }
 }
});
test('the difficulty limits and bass-hand capacity are explicit',()=>{
 const easy=m.pianoHandLimits('easy'),inter=m.pianoHandLimits('intermediate'),advanced=m.pianoHandLimits('advanced');
 assert.ok(easy.rightSpan<inter.rightSpan&&inter.rightSpan<advanced.rightSpan);
 assert.equal(easy.rightNotes,2);assert.equal(advanced.rightNotes,3);assert.equal(advanced.leftNotes,1);
});
test('full generator applies chord limits to tango, vals and milonga',()=>{
 for(const [beats,profile] of [[4,'traditional'],[3,'traditional'],[2,'milonga']])
 for(const difficulty of ['easy','intermediate','advanced']){
  const p=project('Dm,A7',difficulty,beats,160);p.profile=profile;
  assertStacks(m.generate(p).Piano,p);
 }
});
test('simultaneous held-note overlap is detected',()=>{
 const p=project(),notes=[{pitch:60,start:0,duration:2},{pitch:84,start:1,duration:1}];
 assert.ok(m.assessPianoPlayability(notes,p).some(x=>x.kind==='span'&&x.beat===1));
});
test('rapid leap warning preserves edited note pitches',()=>{
 const p=project('C','advanced',4,240),notes=[{pitch:60,start:0,duration:.25},{pitch:84,start:.25,duration:.25}];
 const before=JSON.stringify(notes);assert.ok(m.assessPianoPlayability(notes,p).some(x=>x.kind==='leap'));
 assert.equal(JSON.stringify(notes),before);
});
test('polyphonic overlapping left hand is reported',()=>{
 const p=project(),notes=[{pitch:43,start:0,duration:2},{pitch:50,start:1,duration:1}];
 assert.ok(m.assessPianoPlayability(notes,p).some(x=>x.kind==='polyphony'&&x.hand==='left'));
});
test('custom piano staff split still honors limits',()=>{
 const p=project('G7');p.pianoSplitPitch=65;assertStacks(m.figureMeasure(p,'Piano',0,'chords_up',8),p);
});
test('human reach allows unassigned two-hand chords but honors explicit hands',()=>{
 const p=project();
 const stack=[60,62,64,65,67,69].map(pitch=>({pitch,start:0,duration:1}));
 assert.deepEqual(m.assessPianoPlayability(stack,p,'Piano','human'),[]);
 assert.ok(m.assessPianoPlayability(stack.map(n=>({...n,xmlStaff:1})),p,'Piano','human')
  .some(issue=>issue.kind==='polyphony'&&issue.hand==='right'));
 const assigned=[{...stack[0],xmlStaff:1,staffOverride:2},{...stack[0],pitch:80,xmlStaff:2}];
 assert.ok(m.assessPianoPlayability(assigned,p,'Piano','human').some(i=>i.kind==='span'&&i.hand==='left'));
});
test('human reach allows five-note chords and ignores brief legato overlap only',()=>{
 const p=project(),fingered=[60,62,64,65,67].map(pitch=>({pitch,start:1,duration:1,xmlStaff:1}));
 const release={pitch:84,start:0,duration:1.05,xmlStaff:1};
 assert.deepEqual(m.assessPianoPlayability([release,...fingered],p,'Piano','human'),[]);
 assert.ok(m.assessPianoPlayability([{...release,duration:1.5},...fingered],p,'Piano','human').some(i=>i.kind==='span'));
});
test('editor displays diagnostics without rewriting imported or manually edited notes',()=>{
 const app=fs.readFileSync(path.join(root,'src/App.vue'),'utf8');
 assert.match(app,/assessPianoPlayability\(score\.value\[noteInst\.value\]/);
 assert.match(app,/pianoPlayabilityWarnings\.length/);
 assert.match(app,/imported and manually edited notes are never moved automatically/);
});

test('orchestra styles produce distinctive coordinated accompaniment',()=>{
 const styles=['darienzo','disarli','troilo','fresedo','canaro','pugliese'];
 const signatures=new Set();
 for(const profile of styles){
  const p=project('Dm');p.profile=profile;
  p.roles.A.Piano='chords';p.roles.A.Contrabass='bass';p.roles.A['Bandoneon I']='chords';
  p.instrumentSettings.Contrabass={difficulty:'advanced',activity:1};
  p.instrumentSettings['Bandoneon I']={difficulty:'advanced',activity:1};
  p.orchestration.contrabass.A='traditional';
  const score=m.generate(p);
  assertStacks(score.Piano,p);
  const piano=score.Piano.filter(n=>n.start<4);
  const bass=score.Contrabass.filter(n=>n.start<4);
  assert.ok(piano.length&&bass.length,profile);
  signatures.add(JSON.stringify([piano,bass].map(notes=>notes.map(n=>[n.start,n.pitch,n.duration,n.velocity,n.gate,n.accent]))));
 }
 assert.equal(signatures.size,styles.length);
});
test('section override inherits elsewhere and explicit piano figure wins',()=>{
 const p=project('Dm');p.profile='darienzo';
 const baseline=m.generate(p).Piano;
 p.sectionStyles={A:'disarli'};
 const changed=m.generate(p).Piano;
 assert.notDeepEqual(changed,baseline);
 p.pianoFigures={A:'chords_up'};
 const explicit=m.generate(p).Piano;
 assert.deepEqual(explicit.map(n=>[n.start,n.pitch,n.duration]),baseline.length?m.generate({...p,profile:'traditional',sectionStyles:{}}).Piano.map(n=>[n.start,n.pitch,n.duration]):[]);
});
const load=createDomainLoader(),style=load('src/orchestraStyle.ts'),band=load('src/bandoneon.ts'),plan=load('src/phrasePlan.ts'),edit=load('src/editions.ts'),rhythm=load('src/rhythmEditor.ts'),preview=load('src/rhythmPreview.ts'),io=load('src/io.ts');
test('named profiles coordinate written harmony, playable chord stacks and dynamics by strength',()=>{
 for(const model of band.BANDONEON_MODELS){
  const p=project('Dm,Eb,F#7,C', 'advanced');
  p.profile='disarli';p.transposeSemitones=3;
  const inst='Bandoneon I';
  p.roles.A[inst]='chords';p.instrumentSettings[inst]={difficulty:'advanced',activity:1};p.bandoneonModels={[inst]:model.id};
  p.roles.A.Contrabass='bass';p.instrumentSettings.Contrabass={difficulty:'advanced',activity:1};p.orchestration.contrabass.A='traditional';
  const score=m.generate(p);assert.deepEqual(score,m.generate(p));assertStacks(score.Piano,p);
  const between=(notes)=>notes.filter(n=>n.start<4);
  const left=between(score.Piano).filter(n=>n.pitch<60),bass=between(score.Contrabass),reed=between(score[inst]);
  assert.deepEqual(left.map(n=>[n.start,n.pitch%12]),bass.map(n=>[n.start,n.pitch%12]));
  assert.deepEqual([...new Set(reed.map(n=>n.start))],[1,3]);
  for(const n of [...left,...bass,...reed,...between(score.Piano)]){
   assert.ok(n.duration>0&&n.start+n.duration<=Math.floor(n.start)+1);
   assert.ok(m.chordTones(m.chordAt(p.bars[0].chord,4,n.start)).includes(n.pitch%12),JSON.stringify(n));
  }
  for(const at of [1,3]){
   const notes=reed.filter(n=>n.start===at);
   assert.equal(notes.length,3);
   assert.equal(new Set(notes.map(n=>n.staffOverride)).size,1);
   assert.ok(notes.at(-1).pitch-notes[0].pitch<=12);
   assert.ok(notes.every(n=>band.isBandoneonPitchPlayable(n.pitch+3,model.id,n.staffOverride===1?'right':'left')));
  }
  const medium=m.generate({...p,styleStrength:.5});
  assert.deepEqual(medium.Contrabass.map(n=>n.start),score.Contrabass.map(n=>n.start));
  assert.ok(medium.Contrabass[0].gate<score.Contrabass[0].gate);
  assert.deepEqual(m.generate({...p,styleStrength:0}),m.generate({...p,profile:'traditional'}));
  p.articulation.overrides[inst+':0']='legato';
  assert.ok(m.generate(p)[inst].filter(n=>n.start<4).every(n=>n.articulation==='legato'&&n.gate===undefined));
  assert.deepEqual(io.validateMusicXmlDurations(io.exportMusicXml(p,score),4),[]);
 }
});
test('style settings travel with sections and do not attach to a different phrase by position',()=>{
 const p=m.blankProject({measuresPerSection:[2,2]});p.bars.forEach(b=>b.chord='Dm');
 p.profile='canaro';p.sectionStyles={B:'disarli'};p.pianoFigures={A:'chords_down'};
 p.phrasePlan=plan.createPhrasePlan(p,2);
 const first=p.phrasePlan.phrases[0],key=style.phraseStyleKey(first);
 p.phraseStyles={[key]:'troilo'};
 assert.equal(rhythm.orchestraStyleRhythmForMeasure(p,0),'profile_troilo');
 assert.equal(rhythm.orchestraStyleRhythmForMeasure(p,2),'profile_disarli');
 const unchanged=edit.applyPhrasePlan(p,p.phrasePlan);assert.equal(unchanged.phraseStyles[key],'troilo');
 const finer=edit.applyPhrasePlan(p,plan.createPhrasePlan(p,1));assert.equal(finer.phraseStyles,undefined);
 const resized=m.resizeSections(p,[2,2,2]);assert.deepEqual(resized.sectionStyles,{B:'disarli'});
 assert.deepEqual(resized.pianoFigures,{A:'chords_down'});assert.equal(resized.phraseStyles,undefined);
 const duplicated=load('src/sectionDuplication.ts').duplicateProjectSection(p,1).project;
 assert.equal(duplicated.sectionStyles.C,'disarli');assert.equal(rhythm.orchestraStyleRhythmForMeasure(duplicated,0),'profile_canaro');
 const removed=load('src/sectionDeletion.ts').deleteProjectSection(duplicated,0);
 assert.deepEqual(removed.sectionStyles,{A:'disarli',B:'disarli'});
 const split=load('src/leadSectionBoundary.ts').insertSectionBoundary(p,3);
 assert.equal(split.sectionStyles.C,'disarli');
 const inserted=load('src/measureClipboard.ts').insertBlankMeasures(p,1,1);
 assert.equal(inserted.sectionStyles.B,'disarli');assert.equal(inserted.phraseStyles,undefined);
 assert.equal(rhythm.orchestraStyleRhythmForMeasure({...p,sectionStyles:{B:'__proto__'}},2),'profile_canaro');
});
test('style rhythm preview and apply agree across two profiles, including each piano hand',()=>{
 const p=m.blankProject({measuresPerSection:[1,1]});
 p.bars.forEach(b=>b.chord='Dm');p.roles.B.Piano='chords';p.instrumentSettings.Piano.activity=1;
 p.profile='darienzo';p.sectionStyles={B:'disarli'};
 const source=m.generate({...p,profile:'traditional',sectionStyles:undefined});
 const grid=rhythm.rhythmSlots('profile_darienzo',4);
 const rows=preview.rhythmPreviewForSelection(p,source,'Piano',[0,1],grid,'rhythm',false,true);
 const result=rhythm.applyRhythmPreset(p,source,{instruments:['Piano'],measures:[0,1],preset:'style',mode:'rhythm'});
 assert.deepEqual(rows.flatMap(r=>r.after).map(n=>[n.start,n.pitch,n.duration]),
  result.project.generatedScore.Piano.map(n=>[n.start,n.pitch,n.duration]));
 const unique=(notes)=>[...new Set(notes.map(n=>n.start))];
 assert.deepEqual(unique(rows[1].after.filter(n=>n.pitch<60)),[4,6]);
 assert.deepEqual(unique(rows[1].after.filter(n=>n.pitch>=60)),[5,7]);
 assert.ok(rows[1].after.every(n=>n.rhythmSource.preset==='profile_disarli'));
});
test('regeneration keeps protected notes and updates only the active edition signature',()=>{
 const p=project('Dm');p.profile='canaro';
 const original=edit.snapshotActiveEditions(p);
 const alternative=edit.switchInstrumentEdition(original,'Piano','easy');
 const active=edit.switchInstrumentEdition(alternative,'Piano','advanced');
 const updated=m.replaceInstrumentMeasure(active,active.generatedScore,'Piano',0,[{pitch:65,start:.25,duration:.5,source:'manual'}]);
 updated.sectionStyles={A:'pugliese'};
 assert.ok(edit.getEditionInfo(updated,'Piano','advanced').stale);
 const result=edit.regenerateActiveArrangement(updated);
 assert.deepEqual(result.generatedScore.Piano.filter(n=>n.start<4),updated.generatedScore.Piano.filter(n=>n.start<4));
 assert.ok(!edit.getEditionInfo(result,'Piano','advanced').stale);
 assert.ok(edit.getEditionInfo(result,'Piano','easy').stale);
 assert.deepEqual(result.partEditions.Piano.easy,alternative.partEditions.Piano.easy);
});
console.log(checks+' piano playability and orchestra style checks passed');
