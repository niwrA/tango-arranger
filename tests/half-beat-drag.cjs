const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const load=require('./load-domain.cjs').createDomainLoader();
const edit=load('src/noteEditing.ts');
const music=load('src/music.ts');
const io=load('src/io.ts',{'./tempoExpressions':load('src/tempoExpressions.ts'),'./music':music});
const vue=fs.readFileSync(path.join(root,'src/App.vue'),'utf8');
const css=fs.readFileSync(path.join(root,'src/style.css'),'utf8');
let count=0;function test(name,fn){fn();count++;console.log('PASS',name);}
test('editor snap is sixteenth note for all difficulties',()=>{
 assert.match(vue,/noteStep\.value=0\.25; \/\/ Editing precision is independent of arrangement difficulty/);
 assert.doesNotMatch(vue,/noteStep\.value=instrumentDifficulty\(inst\)/);
});
test('half-beat horizontal move from beat one',()=>assert.equal(edit.dragWrittenNotePosition(0,1,88,44,0.25,4),0.5));
test('half-beat horizontal move from beat two',()=>assert.equal(edit.dragWrittenNotePosition(1,1,88,44,0.25,4),1.5));
test('half-beat move to the left',()=>assert.equal(edit.dragWrittenNotePosition(2,1,-88,44,0.25,4),1.5));
test('sixteenth note movement remains available',()=>assert.equal(edit.dragWrittenNotePosition(0,1,44,44,0.25,4),0.25));
test('eighth note grid also supports half-beat move',()=>assert.equal(edit.dragWrittenNotePosition(0,1,44,44,0.5,4),0.5));
test('note is clamped to measure boundary',()=>assert.equal(edit.dragWrittenNotePosition(2.5,1,1000,44,0.25,4),3));
test('resizing left by half a beat preserves note endpoint',()=>assert.deepEqual({...edit.dragWrittenNoteLeftEdge(1,1,-88,44,0.25,4)},{start:0.5,duration:1.5}));
test('onset and duration persist in protected notes and MusicXML',()=>{
 const p=music.demoProject();p.bars=p.bars.slice(0,2);
 const score=music.generate(p);const inst='Violin I';const notes=score[inst].filter(n=>n.start>=0&&n.start<4).map(n=>({...n}));
 assert.ok(notes.length);const original=notes[0];
 const target=edit.dragWrittenNotePosition(0,original.duration,88,44,0.25,4);
 notes[0]={...original,start:target};
 const next=music.replaceInstrumentMeasure(p,score,inst,0,notes);
 assert.ok(next.generatedScore[inst].some(n=>n.start===0.5&&n.pitch===original.pitch));
 assert.ok(next.protectedBars[`${inst}:0`]);
 assert.deepEqual(Array.from(io.validateMusicXmlDurations(io.exportMusicXml(next,next.generatedScore),4)),[]);
});
test('grid labels expose half beat and sixteenth positions',()=>{
 assert.match(vue,/function noteGridBeatLabel\(beat:number\)/);
 assert.match(vue,/subdivision===2\?`\$\{whole\}&`/);
 assert.match(vue,/\{\{noteGridBeatLabel\(beat\)\}\}/);
});
test('selected note can be nudged by half a beat in either direction',()=>{
 assert.match(vue,/function nudgeSelectedNote\(delta:number\)/);
 assert.match(vue,/@click="nudgeSelectedNote\(-0\.5\)"/);
 assert.match(vue,/@click="nudgeSelectedNote\(0\.5\)"/);
 assert.match(vue,/updateSelectedNote\('start',String\(next\)\)/);
});
test('short note grips do not cover the central drag target',()=>{
 assert.match(css,/\.note-bar \.note-resize-handle\{width:10px/);
 assert.match(css,/\.note-bar\{padding-left:11px;padding-right:11px\}/);
 assert.match(vue,/@pointerdown="startGridNoteDrag\(\$event,n\)"/);
});
test('grid resolution can be changed manually',()=>{
 assert.match(vue,/Drag snap resolution<select v-model\.number="noteStep"/);
 for(const s of ['1','0.5','0.25'])assert.ok(vue.includes(`<option :value="${s}">`));
});
console.log(`${count} half-beat note dragging checks passed`);
