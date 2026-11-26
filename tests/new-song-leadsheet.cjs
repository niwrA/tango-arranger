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
 assert.deepEqual(p.sections.map(s=>s.measures),[2,4]);
 assert.deepEqual(p.lines.map(l=>l.measures),[1,1,4]);
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
check('chord-bearing visual wraps become one musical phrase and remain reversible',()=>{
 const src='[Verse]\nFm C7 Fm\nWhen you are down and you need some\nC7 Fm C7 Fm\nlove and care\n[A#m7]And nothing is going right';
 const auto=previewLeadSheetImport(src,0);
 assert.equal(auto.lines.length,2);
 assert.ok(auto.lines[0].text.replace(/\[[^\]]+\]/g,'').includes('love and care'));
 assert.ok(auto.lines[0].joinedSourceLines.includes(3));
 assert.ok(auto.warnings.some(w=>w.includes('Grouped 1 chord-bearing')));
 assert.deepEqual(auto.bars.filter(b=>b.chord).flatMap(b=>b.chord.split(',')),['Fm','C7','Fm','C7','Fm','C7','Fm','A#m7']);
 const split=previewLeadSheetImport(src,0,[],{}, {3:false});
 assert.equal(split.lines.length,3);
 assert.ok(!split.lines[0].joinedSourceLines.length);
});
check('phrase hints and section boundaries prevent unsafe joins',()=>{
 const p=previewLeadSheetImport('[Verse]\n[Fm]I need some |||\n[C7]love and care\n[Chorus]\n[G]and\n[D]then',0);
 assert.equal(p.lines.length,3);
 assert.equal(p.sections.length,2);
 assert.ok(!p.lines[0].joinedSourceLines.length);
});
check('phrase grouping controls are present in import review',()=>{
 assert.ok(app.includes('newLeadPhraseJoins'));
 assert.ok(app.includes('line.joinedSourceLines'));
 assert.ok(app.includes('Split phrase'));
});
check('ii-V-I chord motion shares a measure without losing harmony',()=>{
 const p=previewLeadSheetImport('[Verse]\n[A#m7]And nothing [D#7sus4]nothing [G#]goes right',0);
 assert.equal(p.lines[0].measures,2);
 assert.deepEqual(p.bars.map(b=>b.chord),['A#m7,D#7sus4','G#']);
 assert.ok(p.lines[0].reason.includes('ii–V–I'));
 assert.ok(p.bars.every(b=>b.chord));
});
check('non-cadential chord rows retain their measure estimates',()=>{
 const p=previewLeadSheetImport('[Intro]\nG# C#/G# G# Gm7 C7',0);
 assert.equal(p.lines[0].measures,5);
 assert.ok(p.bars.every(b=>b.chord));
});
check('repeated ii-V-I resolutions group consistently across choruses',()=>{
 const p=previewLeadSheetImport('[Chorus]\n[C#]call [Cm7]and [Fm7]come [A#m7]back [D#7]home [G#]again\n[Chorus]\n[C#]call [Cm7]and [Fm7]come [A#m7]back [D#7]home [G#]again',0);
 assert.equal(p.sections[0].measures,p.sections[1].measures);
 assert.ok(p.bars.some(b=>b.chord==='A#m7,D#7'));
});
check('leadsheet creates editable provisional Voice notes carrying lyrics',()=>{
 const p=previewLeadSheetImport('[Verse]\n[Fm]When you are down\n[C7]and troubled\n[Chorus]\n[G#]call my name',0);
 const song=projectFromLeadSheet(p,'Guide',4,120);
 const voice=song.importedScore?.Voice??[];
 assert.deepEqual(voice.map(n=>n.lyric),['When','you','are','down','and','troubled','call','my','name']);
 assert.ok(voice.every(n=>n.source==='generated'&&n.pitch>=60&&n.pitch<=81&&n.duration>0));
 assert.ok(voice.every(n=>song.protectedBars['Voice:'+Math.floor(n.start/4)]));
 assert.ok(song.bars.every(b=>b.melody.length===0));
});
check('vocal guide aligns syllables within measures and handles wrapped chord rows',()=>{
 const p=previewLeadSheetImport('[Verse]\nFm C7 Fm\nWhen you are down and you need some\nC7 Fm C7 Fm\nlove and care',0);
 const song=projectFromLeadSheet(p,'Guide',4,120);
 const notes=song.importedScore.Voice;
 assert.deepEqual(notes.map(n=>n.lyric),['When','you','are','down','and','you','need','some','love','and','care']);
 assert.ok(notes.every((n,i)=>i===0||n.start>notes[i-1].start));
 assert.ok(notes.every(n=>n.duration<=4-(n.start%4)+1e-7));
 assert.equal(notes.at(-1).lyric,'care');
});
check('printable leadsheet keeps adjacent chord symbols separated from lyrics',()=>{
 const {readableLeadSheet}=load('src/leadLyrics.ts');
 const rendered=readableLeadSheet('[Verse]\n[Fm][C7]love and care[Fm]');
 const lines=rendered.split('\n');
 assert.ok(lines.some(line=>/\bFm\s+C7\s+Fm\b/.test(line)),rendered);
 assert.ok(lines.some(line=>line==='love and care'),rendered);
 assert.ok(!rendered.includes('Fm[C7'),rendered);
 assert.ok(!rendered.includes('careFm]'),rendered);
});
check('visible application version includes deployed commit identifier',()=>{
 assert.ok(app.includes('appDisplayVersion'));
 assert.ok(app.includes('VITE_APP_BUILD_SHA'));
 assert.ok(app.includes('v{{appDisplayVersion}}'));
});
check('vocal phrase selection follows measure gaps and section boundaries',()=>{
 const {vocalPhrases}=load('src/vocalPhraseAlignment.ts');
 const notes=[{start:0,duration:1,lyric:'When'},{start:1,duration:1,lyric:'you'},
  {start:8,duration:1,lyric:'love'},{start:9,duration:1,lyric:'and'},
  {start:16,duration:1,lyric:'care'}];
 assert.deepEqual(vocalPhrases(notes,4,['A','A','A','A','B']).map(p=>[p.start,p.end,p.label]),
  [[1,1,'When you'],[3,3,'love and'],[5,5,'care']]);
});
check('recorded phrase alignment is monotonic, editable, and supports melisma',()=>{
 const {suggestVocalAlignment,alignedLyric}=load('src/vocalPhraseAlignment.ts');
 const lyrics=[{start:0,duration:1,lyric:'love'},{start:2,duration:1,lyric:'and'},{start:4,duration:1,lyric:'care'}];
 const captured=[{bar:0,beat:0,pitch:60,duration:0.5},{bar:0,beat:1,pitch:62,duration:0.5},
  {bar:0,beat:2,pitch:64,duration:1},{bar:1,beat:0,pitch:65,duration:1}];
 const indices=suggestVocalAlignment(captured,lyrics,4);
 assert.deepEqual(indices,[0,0,1,2]);
 assert.deepEqual(alignedLyric(0,-1,lyrics),{lyric:'love',syllabic:'single'});
 assert.deepEqual(alignedLyric(0,0,lyrics),{lyric:undefined,syllabic:'middle'});
 assert.deepEqual(alignedLyric(2,1,lyrics),{lyric:'care',syllabic:'single'});
 assert.deepEqual(suggestVocalAlignment(captured,[],4),[-1,-1,-1,-1]);
 assert.ok(app.includes('vocalAlignmentPreview'));
 assert.ok(app.includes('Object.assign(note,lyricAssignments'));
});
check('new song wizard exposes starting methods and a MusicXML review',()=>{
 assert.ok(app.includes("newSongStart==='lead'"));
 assert.ok(app.includes("newSongStart==='score'"));
 assert.ok(app.includes('createSongFromLeadSheet'));
 assert.ok(app.includes('createSongFromScore'));
 assert.ok(app.includes('pendingParsed.value=parsed'));
 assert.ok(app.includes('importDialogOpen.value=true'));
});
console.log(count+' new song import wizard checks passed');

check('new song ensemble reviews multiple files against an independent blank draft before adoption',()=>{
 assert.ok(app.includes("newSongStart==='ensemble'"));
 assert.ok(app.includes('Import multiple instrument files'));
 assert.match(app,/<input type="file" multiple[^>]*@change="previewNewEnsemble"/);
 assert.match(app,/<EnsembleImportReview[^>]*:project="newEnsembleDraft"[^>]*@apply="createSongFromEnsemble"/);
 const draft=app.slice(app.indexOf('const newEnsembleDraft='),app.indexOf('async function previewNewEnsemble'));
 assert.ok(draft.includes('blankProject('));
 const preview=app.slice(app.indexOf('async function previewNewEnsemble'),app.indexOf('async function createSongFromEnsemble'));
 assert.ok(preview.includes('Promise.all(files.map'));
 assert.ok(!preview.includes('adoptLocalSong'));
 assert.ok(!preview.includes('project.value='));
 const create=app.slice(app.indexOf('async function createSongFromEnsemble'),app.indexOf('const newLeadSheetText='));
 assert.ok(create.includes('await flushAutosave();stopPlayback();await adoptLocalSong(fresh)'));
 assert.ok(app.includes("if(!open||start!=='ensemble')resetNewEnsemble()"));
});
