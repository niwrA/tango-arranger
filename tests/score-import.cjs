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
check('project picker exposes standard ZIP and JSON types to native file browsers',()=>{
 const picker=app.match(/:accept="importContext==='project'\?'([^']+)':'([^']+)'"/);
 assert.ok(picker);
 const accepted=picker[1].split(',');
 for(const type of ['.tango','.zip','.json','application/zip','application/json'])assert.ok(accepted.includes(type),type);
 assert.ok(!picker[2].split(',').includes('.zip'),'Score import must not offer project archives');
 assert.ok(app.includes("await loadProject(file)"));
});
console.log(n+' unified score import checks passed');

(async()=>{
 const {exportProjectZip,loadProject}=load('src/io.ts');
 const {snapshotActiveEditions}=load('src/editions.ts');
 const project=blankProject({measures:4,beats:4});project.title='Compressed backup';
 const zip=await exportProjectZip(project);
 const restored=await loadProject({arrayBuffer:()=>zip.arrayBuffer()});
 const expected=JSON.parse(JSON.stringify(snapshotActiveEditions(project)));
 assert.deepEqual(restored,expected);
 assert.ok(zip.size<JSON.stringify(expected,null,2).length);
 assert.ok(app.includes('.tango.zip'));assert.ok(app.includes('saveCompressedProject'));
 console.log('PASS compressed native project round trip');
 const archive=fs.readFileSync('src/presets/tigre-viejo-bowed-expression.tango.zip');
 const study=await loadProject({arrayBuffer:async()=>archive.buffer.slice(archive.byteOffset,archive.byteOffset+archive.byteLength)});
 assert.equal(study.bars.length,97);
 assert.match(study.title,/tigre viejo/i);
 assert.ok(Object.values(study.importedScore??{}).flat().some(n=>n.stringGlissando&&n.bowedTremolo));
 assert.ok(Object.values(study.importedScore??{}).flat().some(n=>n.pianoGlissando));
 assert.ok(app.includes('value="__example_tigre_viejo__"'));
 const branch=app.slice(app.indexOf("if(id==='__example_tigre_viejo__')"),app.indexOf("if(id==='__example_pequena_2__'"));
 for(const fragment of ['tigre-viejo-bowed-expression.tango.zip?url','await loadProject(','await adoptLocalSong(study)','await flushAutosave()'])assert.ok(branch.includes(fragment),fragment);
 console.log('PASS bundled Tigre Viejo ZIP loads with expression and opens as a new local copy');
})().catch(error=>{console.error(error);process.exitCode=1;});
