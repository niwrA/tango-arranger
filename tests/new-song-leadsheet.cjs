const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createDomainLoader}=require('./load-domain.cjs');
const load=createDomainLoader();
const {previewLeadSheetImport,arrangeImportedSections,projectFromLeadSheet}=load('src/leadSheetImport.ts');
const app=fs.readFileSync('src/App.vue','utf8');
let count=0;function check(name,fn){fn();count++;console.log('PASS '+name);}
check('section headings create editable sections while inline chords import',()=>{
 const text='[Verse 1]\n[D]Donde el río\n[B7]y la luna\n\n[Chorus]\n[Em]pequeña\n[A7]mi canción';
 const preview=previewLeadSheetImport(text);
 assert.deepEqual(preview.sections.map(s=>[s.title,s.start,s.measures]),[['Verse 1',0,2],['Chorus',2,2]]);
 assert.deepEqual(preview.bars.map(b=>b.chord),['D','B7','Em','A7']);
 const project=projectFromLeadSheet(preview,'Test',4,120);
 assert.deepEqual(project.bars.map(b=>b.section),['A','A','B','B']);
 assert.equal(project.leadLyrics['1'].source,text);
 assert.ok(project.bars.every(b=>b.melody.length===0));
});
check('chords above lyrics are converted into inline chord anchors',()=>{
 const preview=previewLeadSheetImport('D       A7\nDonde el río se queda\nEm\nSin luna');
 assert.equal(preview.bars.length,2);
 assert.ok(preview.bars[0].original.includes('[D]'));
 assert.ok(preview.bars[0].original.includes('[A7]'));
 assert.ok(preview.bars[0].original.includes('Donde'));
 assert.equal(preview.bars[1].chord,'Em');
});
check('section boundary adjustments affect only section assignment, not song text',()=>{
 const preview=previewLeadSheetImport('[Verse]\n[D]one\n[A]two\n[Chorus]\n[G]three\n[C]four');
 const sections=arrangeImportedSections(preview,[0,1]);
 assert.deepEqual(sections.map(s=>s.measures),[1,3]);
 const p=projectFromLeadSheet(preview,'Example',4,128,[0,1]);
 assert.deepEqual(p.bars.map(b=>b.section),['A','B','B','B']);
 assert.equal(p.leadLyrics['1'].source,preview.source);
});
check('new song wizard exposes three starting methods and a MusicXML review',()=>{
 assert.ok(app.includes("newSongStart==='lead'"));
 assert.ok(app.includes("newSongStart==='musicxml'"));
 assert.ok(app.includes('createSongFromLeadSheet'));
 assert.ok(app.includes('createSongFromMusicXml'));
 assert.ok(app.includes('pendingParsed.value=parsed'));
 assert.ok(app.includes('importDialogOpen.value=true'));
});
console.log(count+' new song import wizard checks passed');
