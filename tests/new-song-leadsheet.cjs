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
check('default two measures per lyric line expands provisional arrangement space',()=>{
 const preview=previewLeadSheetImport('[Verse]\n[D]First lyric\n[A7]Second lyric\n[Chorus]\n[Em]Third lyric',2);
 assert.deepEqual(preview.sections.map(s=>[s.start,s.measures]),[[0,4],[4,2]]);
 assert.deepEqual(preview.bars.map(b=>b.chord),['D','','A7','','Em','']);
 assert.equal(preview.source,'[Verse]\n[D]First lyric\n[A7]Second lyric\n[Chorus]\n[Em]Third lyric');
 const p=projectFromLeadSheet(preview,'Two measures',4,120);
 assert.equal(p.bars.length,6);
 assert.deepEqual(p.bars.map(b=>b.section),['A','A','A','A','B','B']);
 assert.equal(p.leadLyrics['1'].source,preview.source);
});
check('per-section measures per lyric line override the default',()=>{
 const preview=previewLeadSheetImport('[Verse]\n[D]one\n[A7]two\n[Chorus]\n[Em]three\n[F]four',2,[1,4]);
 assert.deepEqual(preview.sections.map(s=>[s.start,s.measures]),[[0,2],[2,8]]);
 const p=projectFromLeadSheet(preview,'Mixed',4,120);
 assert.equal(p.bars.length,10);
 assert.deepEqual(p.bars.map(b=>b.section),['A','A','B','B','B','B','B','B','B','B']);
 assert.equal(preview.bars[2].chord,'Em');
 assert.equal(preview.bars[6].chord,'F');
});
check('zero override uses default and invalid or oversized spacing is rejected',()=>{
 assert.equal(previewLeadSheetImport('[Verse]\n[D]hello',3,[0]).bars.length,3);
 assert.throws(()=>previewLeadSheetImport('[D]one',-1),/between 1 and 32/);
 assert.throws(()=>previewLeadSheetImport('[D]one',2,[33]),/between 1 and 32/);
 assert.throws(()=>previewLeadSheetImport(Array.from({length:257},()=> '[D]word').join('\n'),2),/512 measures/);
});
check('wizard exposes per-line default and editable section-specific overrides',()=>{
 assert.ok(app.includes('newLeadMeasuresPerLine'));
 assert.ok(app.includes('newLeadSectionMeasuresPerLine'));
 assert.ok(app.includes('Automatic · analyse chords and phrases'));
 assert.ok(app.includes('Measures per line'));
 assert.ok(app.includes('newLeadSheetPreviewError'));
});
check('automatic estimates keep a regular four-line chord phrase to four measures',()=>{
 const p=previewLeadSheetImport('[Verse]\n[D]line one\n[B7]line two\n[Em]line three\n[A7]line four',0);
 assert.deepEqual(p.sections.map(s=>s.measures),[4]);
 assert.deepEqual(p.lines.map(l=>l.measures),[1,1,1,1]);
 assert.ok(p.lines.every(l=>l.estimated));
 assert.ok(p.lines.every(l=>l.reason.includes('Regular 4-line phrase')));
});
check('two-line phrases and several chord changes produce explainable proposals',()=>{
 const p=previewLeadSheetImport('[Verse]\n[D]first line\n[G]second line\n[Chorus]\n[C]some [G]lyrics [Am]here [F]again',0);
 assert.deepEqual(p.sections.map(s=>s.measures),[4,4]);
 assert.deepEqual(p.lines.map(l=>l.measures),[2,2,4]);
 assert.deepEqual(p.bars.filter(b=>b.chord).map(b=>b.chord),['D','G','C','G','Am','F']);
 assert.ok(p.lines[2].reason.includes('4 distinct chord'));
});
check('explicit measure separators outrank inference; manual line and section rules outrank both',()=>{
 const src='[Verse]\n[D]one || [G]two ||\n[Am]third line\n[Chorus]\n[C]fourth';
 const auto=previewLeadSheetImport(src,0);
 assert.equal(auto.lines[0].measures,2);
 assert.equal(auto.lines[0].estimated,false);
 const modified=previewLeadSheetImport(src,0,[4,0],{1:3});
 assert.deepEqual(modified.lines.map(l=>l.measures),[3,4,1]);
 assert.equal(modified.lines[0].reason,'Manual override for this line');
 assert.equal(modified.lines[1].reason,'Section override');
 assert.equal(modified.sections[1].start,7);
 assert.equal(projectFromLeadSheet(modified,'Test',4,124).bars.length,8);
});
check('chord-only sequences separated by bars retain distinct measure harmony',()=>{
 const p=previewLeadSheetImport('[Intro]\nD | B7 | Em | A7',0);
 assert.deepEqual(p.bars.map(b=>b.chord),['D','B7','Em','A7']);
 assert.equal(p.lines[0].measures,4);
});
check('automatic importer reveals editable per-line allocation and rationale',()=>{
 assert.ok(app.includes('newLeadLineMeasures'));
 assert.ok(app.includes('newLeadSheetPreview.lines'));
 assert.ok(app.includes('line.reason'));
 assert.ok(app.includes('Automatic · analyse chords and phrases'));
});
check('page markers are excluded from normalized lyrics and never create measures',()=>{
 const text=['[Intro]','G#    C#/G#   G#    Gm7   C7','[Verse 1]','Page 1/5',
 '            Fm       C7                Fm','When you are down and troubled and you need some',
 'C7         Fm C7 Fm','love and care','[Chorus]','Page 2 of 5',
 'G#     G#maj7      C#','You just call out my name','Page 3/5'].join('\n');
 const p=previewLeadSheetImport(text,0);
 assert.deepEqual(p.sections.map(x=>x.title),['Intro','Verse 1','Chorus']);
 assert.ok(!p.source.includes('Page 1/5'));
 assert.ok(!p.source.includes('Page 2 of 5'));
 assert.ok(!p.source.includes('Page 3/5'));
 assert.ok(!p.lines.some(x=>/Page \\d/.test(x.text)));
 assert.ok(p.warnings.some(x=>x.includes('Removed 3 page markers')));
 assert.ok(p.bars.some(x=>x.chord.includes('G#')));
 assert.ok(p.bars.some(x=>x.chord.includes('C#/G#')));
});
check('wrapped unchorded lyrics are joined without creating a new measure',()=>{
 const p=previewLeadSheetImport('[Verse]\n[Fm]When you are down and you need some\nlove and care\n[C7]Another phrase',0);
 assert.equal(p.lines.length,2);
 assert.ok(p.lines[0].text.includes('some love and care'));
 assert.ok(p.warnings.some(w=>w.includes('Joined 1 wrapped lyric line')));
});
check('pipe hints distinguish events, measures and phrase endings',()=>{
 const p=previewLeadSheetImport('[Verse]\n[Fm]When | [C7]troubled || [Fm]care |||\n[G#]and | [D#7sus4]there',0);
 assert.equal(p.lines[0].measures,2);
 assert.equal(p.lines[0].estimated,false);
 assert.ok(p.lines[0].reason.includes('Suggested ||'));
 assert.ok(p.bars.some(b=>b.chord.includes('D#7sus4')));
 assert.ok(p.source.includes('|||'));
});
check('compound and slash chord symbols from pasted sheets are recognized',()=>{
 const p=previewLeadSheetImport('[Intro]\nGm7add11   D#7sus4   G#maj7   C#/G#   A#m7',0);
 assert.deepEqual(p.bars.filter(b=>b.chord).map(b=>b.chord),['Gm7add11','D#7sus4','G#maj7','C#/G#','A#m7']);
});
check('new song wizard exposes three starting methods and a MusicXML review',()=>{
 assert.ok(app.includes("newSongStart==='lead'"));
 assert.ok(app.includes("newSongStart==='score'"));
 assert.ok(app.includes('createSongFromLeadSheet'));
 assert.ok(app.includes('createSongFromScore'));
 assert.ok(app.includes('pendingParsed.value=parsed'));
 assert.ok(app.includes('importDialogOpen.value=true'));
});
console.log(count+' new song import wizard checks passed');
