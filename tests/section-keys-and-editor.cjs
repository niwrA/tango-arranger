const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const load=require('./load-domain.cjs').createDomainLoader();
const music=load('src/music.ts');
let count=0;
function test(name,fn){fn();console.log('PASS',name);count++}
test('section key transposition changes chords but not outside section',()=>{
 const p=music.demoProject();const before=p.bars.map(b=>b.chord);const next=music.changeSectionKey(p,'A1','Em','chords');
 assert.equal(next.sectionKeys.A1,'Em');assert.equal(next.bars[0].chord,'Em');assert.equal(next.bars[2].chord,'Am');
 assert.equal(next.bars[8].chord,before[8]);assert.equal(next.bars[0].melody[0].pitch,p.bars[0].melody[0].pitch);
 assert.equal(p.sectionKeys.A1,'Dm');assert.equal(p.bars[0].chord,'Dm');
});
test('key-only mode does not alter chord symbols or melody',()=>{
 const p=music.demoProject();const next=music.changeSectionKey(p,'A1','Gm','signature');
 assert.equal(next.bars[0].chord,p.bars[0].chord);assert.equal(next.bars[0].melody[0].pitch,p.bars[0].melody[0].pitch);
 assert.equal(next.sectionKeys.A1,'Gm');
});
test('chords and melody mode transposes lead notes and preserves rhythm',()=>{
 const p=music.demoProject();const next=music.changeSectionKey(p,'A1','Em','chords-and-melody');
 assert.equal(next.bars[0].melody[0].pitch,p.bars[0].melody[0].pitch+2);
 assert.equal(next.bars[0].melody[0].start,p.bars[0].melody[0].start);
 assert.equal(next.bars[8].melody[0].pitch,p.bars[8].melody[0].pitch);
});
test('slash bass and chord quality transpose without being rewritten',()=>{
 assert.equal(music.transposeChordForKey('Dm7/A',2,'Em'),'Em7/B');
 assert.equal(music.transposeChordForKey('G7/B',-2,'F'),'F7/A');
 assert.equal(music.transposeChordForKey('Cmaj7/G',1,'Db'),'Dbmaj7/Ab');
});
test('comma-separated repeated chords preserve exact slot count',()=>{
 const p=music.demoProject();p.bars[0].chord='C,C,C,G7';
 const next=music.changeSectionKey(p,'A1','Ebm','chords');
 assert.equal(next.bars[0].chord.split(',').length,4);
 assert.equal(next.bars[0].chord,'Db,Db,Db,Ab7');
 assert.equal(music.parseChordSequence(next.bars[0].chord,4).length,4);
});
test('same-tonic major/minor change never silently reharmonizes chord qualities',()=>{
 const p=music.demoProject();p.sectionKeys.A1='C';p.bars[0].chord='C,G7';
 const next=music.changeSectionKey(p,'A1','Cm','chords');
 assert.equal(next.bars[0].chord,'C,G7');assert.equal(next.sectionKeys.A1,'Cm');
});
test('protected manually edited notes transpose only in chords-and-melody mode',()=>{
 const p=music.demoProject();p.bars=p.bars.slice(0,2);const fresh=music.generate(p);
 const notes=fresh['Violin I'].filter(n=>n.start<4).map(n=>({...n}));
 assert.ok(notes.length);
 const edited=music.replaceInstrumentMeasure(p,fresh,'Violin I',0,notes);
 const chordsOnly=music.changeSectionKey(edited,'A1','Em','chords');
 const all=music.changeSectionKey(edited,'A1','Em','chords-and-melody');
 const pitch=edited.importedScore['Violin I'].find(n=>n.start===notes[0].start).pitch;
 assert.equal(chordsOnly.importedScore['Violin I'].find(n=>n.start===notes[0].start).pitch,pitch);
 assert.equal(all.importedScore['Violin I'].find(n=>n.start===notes[0].start).pitch,pitch+2);
 assert.equal(all.generatedScore['Violin I'].find(n=>n.start===notes[0].start).pitch,pitch+2);
 assert.equal(all.protectedBars['Violin I:0'],true);
});
test('invalid section and key changes are atomic',()=>{
 const p=music.demoProject();
 assert.throws(()=>music.changeSectionKey(p,'X','Em','chords'));
 assert.throws(()=>music.changeSectionKey(p,'A1','H#','chords'));
 assert.equal(p.sectionKeys.A1,'Dm');
});
test('lead sheet retains free text and suggestions require an explicit action',()=>{
 const app=fs.readFileSync(path.join(root,'src/App.vue'),'utf8');
 assert.match(app,/leadDrafts=ref<Record<number,string>>/);
 assert.match(app,/leadDrafts\.value\[i\]=input\.value/);
 assert.match(app,/syncLeadCompletion\(i,input,false\)/);
 assert.match(app,/@click="toggleLeadSuggestions\(/);
 assert.match(app,/:value="leadChordText\(/);
 assert.match(app,/Your draft is retained/);
 assert.match(app,/@submit\.prevent="applySectionKeyChange"/);
});
test('section key modal requires explicit confirmation and shows errors inside dialog',()=>{
 const app=fs.readFileSync(path.join(root,'src/App.vue'),'utf8');
 const css=fs.readFileSync(path.join(root,'src/style.css'),'utf8');
 assert.match(app,/const keyChangeMode=ref<SectionKeyChangeMode>\('chords'\)/);
 assert.match(app,/keyChangeMode\.value='chords-and-melody'/);
 assert.match(app,/<Teleport to="body">/);
 assert.match(app,/<form class="editor key-change-dialog"[^>]+@submit\.prevent="applySectionKeyChange"/);
 assert.match(app,/type="radio" name="section-key-mode" value="chords"/);
 assert.match(app,/type="radio" name="section-key-mode" value="chords-and-melody"/);
 assert.match(app,/type="radio" name="section-key-mode" value="signature"/);
 assert.match(app,/<button type="submit" class="primary key-change-confirm">Apply key change<\/button>/);
 assert.match(app,/v-if="keyChangeError" class="key-change-error" role="alert"/);
 assert.match(app,/function cancelSectionKeyChange\(\)\{pendingKeyChange\.value=null;keyChangeError\.value='';\}/);
 assert.match(css,/\.key-change-actions\{[^}]*flex:0 0 auto/);
 assert.doesNotMatch(app,/@click="applySectionKeyChange\('/);
});
test('duration editor has explicit Apply and saved duration feedback',()=>{
 const app=fs.readFileSync(path.join(root,'src/App.vue'),'utf8');
 assert.match(app,/v-model="writtenDurationDraft"/);
 assert.match(app,/@click="applyWrittenDurationDraft"/);
 assert.match(app,/Saved duration: <strong>\{\{selectedEvent\.duration\}\} beats/);
 assert.match(app,/width:\(Math.min\(n.start\+n.duration,/);
});
console.log(`${count} section key / chord / duration regression checks passed`);
