const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createDomainLoader}=require('./load-domain.cjs');
const load=createDomainLoader();
const {blankProject,parseChordSequence}=load('src/music.ts');
const {deleteProjectSection}=load('src/sectionDeletion.ts');
const {leadLyricsFromSong,parseLeadLyrics,positionLeadChords}=load('src/leadLyrics.ts');
const app=fs.readFileSync('src/App.vue','utf8');
let count=0;function check(label,cb){cb();count++;console.log('PASS '+label);}
function example(){
 const p=blankProject({sections:4,measuresPerSection:[2,2,2,2],beats:4});
 p.bars[4].chord='Dm,A7';
 p.bars[6].chord='Gm';
 p.bars[7].melody=[{pitch:68,start:0,duration:1}];
 p.generatedScore={Voice:[{pitch:60,start:16,duration:1,lyric:'old'},{pitch:62,start:25,duration:2,lyric:'new'}],Piano:[{pitch:50,start:15,duration:3},{pitch:53,start:24,duration:1}]};
 p.importedScore={Voice:[{pitch:62,start:25,duration:1,lyric:'new'}]};
 p.baseScore={Voice:[{pitch:60,start:16,duration:1,lyric:'old'}]};
 p.protectedBars={'Voice:4':true,'Voice:6':true};
 p.measureRoles={'Bandoneon I:6':'melody'};
 p.roles.D['Bandoneon I']='melody';
 p.orchestration.bandoneon.D={'Bandoneon I':{target:'independent',method:'exact'}};
 p.expressionRanges=[{instrument:'Voice',startMeasure:4,endMeasure:4,from:50,to:60},{instrument:'Voice',startMeasure:6,endMeasure:6,from:80,to:90}];
 p.leadLyrics={'1':{source:'old lyrics',useExistingMelody:true}};
 return p;
}
check('delete middle C: retain A, B, shift D into C and preserve its arrangement',()=>{
 const p=example(),snapshot=JSON.stringify(p);
 const n=deleteProjectSection(p,2);
 assert.equal(JSON.stringify(p),snapshot);
 assert.equal(n.bars.length,6);
 assert.deepEqual([...new Set(n.bars.map(b=>b.section))],['A','B','C']);
 assert.equal(n.bars[4].chord,'Gm');
 assert.equal(n.bars[5].melody[0].pitch,68);
 assert.equal(n.roles.C['Bandoneon I'],'melody');
 assert.equal(n.orchestration.bandoneon.C['Bandoneon I'].method,'exact');
 assert.equal(n.measureRoles['Bandoneon I:4'],'melody');
 assert.equal(n.protectedBars['Voice:4'],true);
 assert.deepEqual(n.generatedScore.Voice.map(v=>v.start),[17]);
 assert.deepEqual(n.importedScore.Voice.map(v=>v.start),[17]);
 assert.equal(n.generatedScore.Voice[0].lyric,'new');
 assert.deepEqual(n.expressionRanges.map(x=>x.startMeasure),[4]);
 assert.equal(n.leadLyrics,undefined);
});
check('delete latest D, leaving previous C intact',()=>{
 const n=deleteProjectSection(example(),3);
 assert.equal(n.bars.length,6);
 assert.deepEqual([...new Set(n.bars.map(b=>b.section))],['A','B','C']);
 assert.equal(n.bars[4].chord,'Dm,A7');
 assert.ok(!n.generatedScore.Voice.some(x=>x.start>=24));
});
check('delete first section shifts all following scores and protection',()=>{
 const n=deleteProjectSection(example(),0);
 assert.deepEqual([...new Set(n.bars.map(b=>b.section))],['A','B','C']);
 assert.equal(n.generatedScore.Voice[0].start,8);
 assert.equal(n.protectedBars['Voice:2'],true);
});
check('an exact four-beat bar followed by || does not skip a measure',()=>{
 const plan=parseLeadLyrics('@1 a | @2 b | @3 c | @4 d ||\n@1 e',4);
 assert.deepEqual(plan.notes.map(n=>n.start),[0,1,2,3,4]);
});
check('song must retain a section',()=>{
 assert.throws(()=>deleteProjectSection(blankProject({sections:1,measuresPerSection:4}),0),/at least one section/);
});
check('read existing Voice note and chord markers with precise bar positions',()=>{
 const p=example();
 const notes={Voice:[{pitch:60,start:16,duration:1,lyric:'pequeña'},{pitch:62,start:17.5,duration:.5,lyric:'tango'}]};
 const source=leadLyricsFromSong(p,notes,'Voice',1);
 const parsed=parseLeadLyrics(source,p.beats);
 assert.equal(source.split('\n').length,p.bars.length);
 assert.deepEqual(parsed.notes.map(n=>n.text),['pequeña','tango']);
 // Human-readable source retains bar boundaries; the existing melody retains
 // sub-beat timing instead of emitting @2.5 into user-visible song text.
 assert.deepEqual(parsed.notes.map(n=>n.start),[16,17]);
 assert.ok(!source.includes('@'));
 assert.deepEqual(notes.Voice.map(n=>n.start),[16,17.5]);
 const mapped=positionLeadChords(parsed,p.beats,p.bars.length,parsed.notes.map(n=>n.start));
 assert.deepEqual(mapped.filter(c=>c.measure===4).map(c=>[c.beat,c.chord]),[[0,'Dm'],[2,'A7']]);
 assert.ok(mapped.some(c=>c.measure===6&&c.chord==='Gm'));
});
check('loading from song does not change the project until applying',()=>{
 assert.ok(app.includes('function loadLeadLyricsFromSong()'));
 assert.ok(app.includes('leadLyricsSource.value=serializeVisualAlignment(createLeadAlignment('));
 assert.ok(app.includes('@click="loadLeadLyricsFromSong"'));
 assert.ok(app.includes('function deleteLeadSection(i:number)'));
 assert.ok(app.includes('deleteProjectSection(project.value,i)'));
 assert.ok(app.includes('window.confirm('));
 assert.ok(app.includes('@click="deleteLeadSection(span.sectionIndex)"'));
});
console.log(count+' section delete and lyrics readback tests passed');
