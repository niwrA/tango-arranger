const assert=require('node:assert/strict');
const fs=require('node:fs');
const {Midi}=require('@tonejs/midi');
const {createDomainLoader}=require('./load-domain.cjs');
const load=createDomainLoader();
const {parseMidiDetailed}=load('src/scoreImport.ts');
const {blankProject}=load('src/music.ts');
const {createMergePlan,previewMerge}=load('src/musicXmlMerge.ts');
const app=fs.readFileSync('src/App.vue','utf8');
let n=0;function check(name,fn){fn();n++;console.log('PASS '+name);}
function example(timeSignature=[4,4]){
 const midi=new Midi();
 midi.header.timeSignatures.push({ticks:0,timeSignature});
 midi.header.update();
 const track=midi.addTrack();track.name='Singing melody';
 track.addNote({midi:60,ticks:0,durationTicks:midi.header.ppq,velocity:.8});
 track.addNote({midi:64,ticks:midi.header.ppq*2,durationTicks:midi.header.ppq,velocity:.7});
 return midi.toArray();
}
check('MIDI notes use tick timing and retain track metadata in shared score model',()=>{
 const bytes=example(),parsed=parseMidiDetailed(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'From MIDI');
 assert.equal(parsed.parts.length,1);
 assert.equal(parsed.parts[0].name,'Singing melody');
 assert.deepEqual(parsed.parts[0].notes.map(note=>note.start),[0,2]);
 assert.deepEqual(parsed.parts[0].notes.map(note=>note.duration),[1,1]);
 assert.equal(parsed.measureCount,1);
 assert.equal(parsed.measures[0].beats,4);
 assert.equal(parsed.chords[0],'');
 assert.ok(parsed.warnings.some(w=>w.includes('MIDI')));
});
check('MIDI meter becomes measure-aware data for common alignment',()=>{
 const bytes=example([3,4]),parsed=parseMidiDetailed(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
 assert.equal(parsed.measures[0].beats,3);
 assert.equal(parsed.measures[0].beatType,4);
 assert.equal(parsed.parts[0].pitchedMeasures,1);
 const p=blankProject({sections:1,measuresPerSection:1,beats:3});
 const plan=createMergePlan(p,parsed,'Violin I',0,'lead','test.mid');
 assert.equal(plan.rows.length,1);
 assert.equal(plan.rows[0].theirs,0);
 assert.equal(plan.rows[0].notes,'theirs');
 const review=previewMerge(p,parsed,plan);
 assert.ok(review.proposed);
});
check('both score formats use the same import review in new and existing songs',()=>{
 assert.ok(app.includes('Import MusicXML / MIDI'));
 assert.ok(app.includes('createSongFromScore'));
 assert.ok(app.includes('readScoreImport(file)'));
 assert.ok(app.includes("importMode.value='merge'"));
 assert.ok(app.includes('pendingParsed.value=parsed'));
 assert.ok(!app.includes('pending.value=importMidi(await file.arrayBuffer())'));
});
console.log(n+' unified score import checks passed');
