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
console.log(checks+' piano playability checks passed');
