const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createDomainLoader}=require('./load-domain.cjs');
const root=path.resolve(__dirname,'..');
const load=createDomainLoader();
const music=load('src/music.ts'),io=load('src/io.ts',{'./tempoExpressions':load('src/tempoExpressions.ts'),'./music':music});
let count=0;function test(label,fn){fn();count++;console.log('PASS',label);}
function prepared(beats=4){
 const p=music.blankProject({sections:1,measuresPerSection:2,beats});
 p.bars[0].chord='Dm,A7';p.bars[1].chord='Dm';
 p.roles.A['Violin I']='chords';p.roles.A['Violin II']='chords';
 p.instrumentSettings['Violin I'].activity=1;p.instrumentSettings['Violin II'].activity=1;
 p.orchestration.violin.A={'Violin I':'tango_staccato','Violin II':'pizzicato'};
 return p;
}
function notes(p,inst='Violin I',bar=0){return music.generate(p)[inst].filter(n=>n.start>=bar*p.beats&&n.start<(bar+1)*p.beats);}
test('new projects use beat-based violin chord techniques, not arpeggios by default',()=>{
 const p=music.blankProject();
 assert.equal(p.orchestration.violin.A['Violin II'],'pizzicato');
 assert.equal(p.orchestration.violin.B['Violin II'],'tango_staccato');
});
test('one note on each beat, independent of violin difficulty and profile density',()=>{
 for(const difficulty of ['easy','intermediate','advanced'])for(const profile of ['traditional','fresedo','pugliese']){
  const p=prepared();p.profile=profile;p.instrumentSettings['Violin I'].difficulty=difficulty;
  const events=notes(p);
  assert.equal(events.length,4,`${profile}/${difficulty}`);
  assert.deepEqual(Array.from(events.map(n=>n.start)),[0,1,2,3]);
  assert.ok(events.every(n=>n.duration===1));
 }
});
test('one note per beat in 2/4 and 3/4',()=>{
 for(const beats of [2,3]){const p=prepared(beats);p.bars[0].chord='Dm';
  assert.deepEqual(Array.from(notes(p).map(n=>n.start)),Array.from({length:beats},(_,i)=>i));}
});
test('pizzicato is single-note and always uses pizzicato technique',()=>{
 const p=prepared();const events=notes(p,'Violin II');
 assert.equal(events.length,4);assert.ok(events.every(n=>n.technique==='pizzicato'));
 assert.ok(events.filter(n=>n.articulation==='staccato').every(n=>n.gate===0.22));
});
test('tango staccato is much shorter than marcato and marcato is louder',()=>{
 const p=prepared(),events=notes(p);
 const staccato=events.find(n=>n.articulation==='staccato');
 const marcato=events.find(n=>n.articulation==='marcato_staccato');
 assert.ok(staccato&&marcato);assert.equal(staccato.gate,0.16);assert.equal(marcato.gate,0.58);
 assert.ok(music.noteSoundingDuration(staccato)<music.noteSoundingDuration(marcato));
 assert.ok(music.noteSoundingVelocity(marcato)>music.noteSoundingVelocity(staccato));
});
test('chord tone changes exactly when harmony changes',()=>{
 const p=prepared();const events=notes(p);
 for(const n of events){const chord=music.chordAt(p.bars[0].chord,p.beats,n.start);
  assert.ok(music.chordTones(chord).includes(n.pitch%12),`${chord} at beat ${n.start}`);}
});
test('composer profile chooses different accent patterns and section overrides take precedence',()=>{
 const p=prepared();p.profile='troilo';
 assert.deepEqual(Array.from(music.violinMarcatoBeatsFor(p,'A','Violin I')),[1,3]);
 assert.deepEqual(Array.from(notes(p).filter(n=>n.accent).map(n=>n.start)),[1,3]);
 p.violinMarcatoBeats={A:{'Violin I':[0,3]}};
 assert.deepEqual(Array.from(notes(p).filter(n=>n.accent).map(n=>n.start)),[0,3]);
 p.violinMarcatoBeats.A['Violin I']=[];
 assert.equal(notes(p).filter(n=>n.accent).length,0);
});
test('note editor suggestions follow violin chord technique and marcato beats',()=>{
 const p=prepared();p.violinMarcatoBeats={A:{'Violin I':[2]}};
 const plain=music.suggestedEditorNote(p,'Violin I',0,0,69);
 const strong=music.suggestedEditorNote(p,'Violin I',0,2,69);
 assert.equal(plain.articulation,'staccato');assert.equal(plain.gate,0.16);
 assert.equal(strong.articulation,'marcato_staccato');assert.equal(strong.gate,0.58);
});
test('arpeggio is exactly four notes across the entire measure, not four per beat',()=>{
 const p=prepared();p.orchestration.violin.A['Violin I']='arpeggio';
 const events=notes(p);
 assert.equal(events.length,4);
 assert.deepEqual(Array.from(events.map(n=>n.start)),[0,1,2,3]);
 assert.ok(events.every(n=>n.duration===1));
});
test('ascending triad arpeggio goes root-third-fifth-octave root',()=>{
 const p=prepared();p.bars[0].chord='Dm';p.orchestration.violin.A['Violin I']='arpeggio';
 p.violinArpeggioDirections={A:{'Violin I':'up'}};
 const pitches=notes(p).map(n=>n.pitch);
 assert.deepEqual(Array.from(pitches.map(n=>n%12)),[2,5,9,2]);
 assert.ok(pitches.every((n,i)=>i===0||n>pitches[i-1]));
});
test('descending triad arpeggio goes octave root-fifth-third-root',()=>{
 const p=prepared();p.bars[0].chord='Dm';p.orchestration.violin.A['Violin I']='arpeggio';
 p.violinArpeggioDirections={A:{'Violin I':'down'}};
 const pitches=notes(p).map(n=>n.pitch);
 assert.deepEqual(Array.from(pitches.map(n=>n%12)),[2,9,5,2]);
 assert.ok(pitches.every((n,i)=>i===0||n<pitches[i-1]));
});
test('four-tone seventh chord uses root-third-fifth-seventh without extra root',()=>{
 const p=prepared();p.bars[0].chord='Dm7';p.orchestration.violin.A['Violin I']='arpeggio';
 p.violinArpeggioDirections={A:{'Violin I':'up'}};
 assert.deepEqual(Array.from(notes(p).map(n=>n.pitch%12)),[2,5,9,0]);
});
test('arpeggio adapts to the chord active at each of the four onsets',()=>{
 const p=prepared();p.bars[0].chord='Dm,Dm,Dm,G';p.orchestration.violin.A['Violin I']='arpeggio';
 for(const n of notes(p)){
  const chord=music.chordAt(p.bars[0].chord,p.beats,n.start);
  assert.ok(music.chordTones(chord).includes(n.pitch%12),`${chord} at ${n.start}`);
 }
});
test('arpeggio alternates direction by section measure, not globally',()=>{
 const p=prepared();p.bars[0].chord='Dm';p.bars[1].chord='Dm';
 p.orchestration.violin.A['Violin I']='arpeggio';
 const a=notes(p,'Violin I',0).map(n=>n.pitch),b=notes(p,'Violin I',1).map(n=>n.pitch);
 assert.ok(a[3]>a[0]);assert.ok(b[3]<b[0]);
});
test('pizzicato arpeggio has four pizzicato notes with short sounding gates',()=>{
 const p=prepared();p.orchestration.violin.A['Violin I']='pizzicato_arpeggio';
 const events=notes(p);
 assert.equal(events.length,4);
 assert.ok(events.every(n=>n.technique==='pizzicato'&&n.gate===0.22));
});
test('four-note arpeggio spans 2/4 and 3/4 as well as 4/4',()=>{
 for(const beats of [2,3,4]){
  const p=prepared(beats);p.bars[0].chord='Dm';p.orchestration.violin.A['Violin I']='arpeggio';
  const events=notes(p);
  assert.equal(events.length,4);
  assert.deepEqual(Array.from(events.map(n=>n.start)),[0,1,2,3].map(n=>n*beats/4));
  assert.ok(events.every(n=>n.duration===beats/4));
  const xml=io.exportMusicXml(p,music.generate(p));
  assert.deepEqual(Array.from(io.validateMusicXmlDurations(xml,beats)),[]);
 }
});
test('arpeggio direction survives section restructuring',()=>{
 const p=prepared();p.violinArpeggioDirections={A:{'Violin I':'down'}};
 const resized=music.resizeSections(p,[3,2]);
 assert.equal(resized.violinArpeggioDirections.A['Violin I'],'down');
});
test('note editor suggests the arpeggio step duration',()=>{
 const p=prepared(2);p.orchestration.violin.A['Violin I']='arpeggio';
 assert.equal(music.suggestedEditorNote(p,'Violin I',0,0,69).duration,0.5);
});
test('arpeggio MusicXML contains exactly four non-rest violin notes in 4/4',()=>{
 const p=prepared();p.bars[0].chord='Dm';p.orchestration.violin.A['Violin I']='arpeggio';
 const xml=io.exportMusicXml(p,music.generate(p));
 assert.deepEqual(Array.from(io.validateMusicXmlDurations(xml,p.beats)),[]);
 assert.equal(notes(p).length,4);
});
test('MusicXML exports distinct staccato dots, marcato > accents and pizzicato with full beats',()=>{
 const p=prepared();const xml=io.exportMusicXml(p,music.generate(p));
 assert.match(xml,/<accent\/>/);
 assert.doesNotMatch(xml,/<strong-accent/);
 assert.match(xml,/<staccato\/>/);
 assert.match(xml,/pizz\./);
 assert.deepEqual(Array.from(io.validateMusicXmlDurations(xml,p.beats)),[]);
});
test('section accent overrides survive structural edits',()=>{
 const p=prepared();p.violinMarcatoBeats={A:{'Violin I':[1]}};
 const resized=music.resizeSections(p,[3,2]);
 assert.deepEqual(Array.from(resized.violinMarcatoBeats.A['Violin I']),[1]);
});
test('orchestration interface exposes per-violin marcato beat control',()=>{
 const app=fs.readFileSync(path.join(root,'src/App.vue'),'utf8');
 assert.match(app,/setViolinMarcato\(inst,\$event\)/);
 assert.match(app,/violinMarcatoText\(inst\)/);
 assert.match(app,/tango_staccato/);
 assert.match(app,/setViolinArpeggioDirection\(inst,\$event\)/);
});
console.log(`${count} violin chord accompaniment checks passed`);
