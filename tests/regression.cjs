const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const cp=require('node:child_process');
let ts;try{ts=require('typescript')}catch{ts=require(path.join(cp.execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim(),'typescript'));}
const root=path.resolve(__dirname,'..');
function load(file,imports={}){
  const src=fs.readFileSync(path.join(root,file),'utf8');
  const compiled=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const mod={exports:{}};
  vm.runInNewContext(`(function(require,module,exports){${compiled}\n})`,{console,Blob,URL,setTimeout}, {filename:file})((name)=>{
    if(imports[name])return imports[name];
    if(name==='jszip')return class JSZip{};
    if(name==='@tonejs/midi')return {Midi:class Midi{}};
    throw Error('Unexpected import '+name);
  },mod,mod.exports);
  return mod.exports;
}
const music=load('src/music.ts');
const io=load('src/io.ts',{'./music':music});
let passes=0;
function test(label,fn){fn();passes++;console.log('PASS',label);}
const project=music.demoProject();
test('default 4/4 and instrument settings',()=>{assert.equal(project.beats,4);assert.equal(project.instrumentSettings['Bandoneon II'].activity,0.85)});
test('all 6 instruments active in demo',()=>{let score=music.generate(project);for(const inst of music.INSTRUMENTS.filter(x=>x!=='Voice')){const a=music.instrumentActivity(score,inst,project.bars.length,4);assert.ok(a>=0.6,`${inst}: ${a}`)} });
test('explicit rests respected',()=>{let p=music.demoProject();p.roles.A1['Bandoneon II']='rest';let score=music.generate(p);assert.equal(score['Bandoneon II'].filter(x=>x.start<8*4).length,0)});
test('empty melody produces bandoneon accompaniment',()=>{let p=music.demoProject();p.bars.forEach(b=>b.melody=[]);let s=music.generate(p);assert.ok(s['Bandoneon II'].length>0)});
test('skill changes piano chord density and register',()=>{let p=music.demoProject();p.instrumentSettings.Piano.difficulty='advanced';let s=music.generate(p);const pitches=new Set(s.Piano.filter(n=>n.start<4).map(n=>n.pitch));assert.ok(Math.max(...pitches)-Math.min(...pitches)>12);p.instrumentSettings.Piano.difficulty='easy';let e=music.generate(p);assert.ok(e.Piano.filter(n=>n.start<4).length<s.Piano.filter(n=>n.start<4).length)});
test('all generated MusicXML measures complete',()=>{const xml=io.exportMusicXml(project,music.generate(project));assert.deepEqual(Array.from(io.validateMusicXmlDurations(xml,4)),[]);assert.match(xml,/<dynamics/);assert.match(xml,/<wedge/);assert.match(xml,/<accent\/>/);fs.writeFileSync(path.join(root,'tests/generated-smoke.musicxml'),xml)});
test('mixed note overlaps, simultaneity, rests and ties',()=>{let p=music.demoProject();p.bars=p.bars.slice(0,3);let s=music.generate(p);s.Piano=[{pitch:60,start:0,duration:1.75},{pitch:64,start:0,duration:1.5},{pitch:67,start:1,duration:1.3},{pitch:69,start:3.25,duration:0.5}];const xml=io.exportMusicXml(p,s);assert.deepEqual(Array.from(io.validateMusicXmlDurations(xml,4)),[]);assert.match(xml,/<tie type="start"\/>/);});
test('two four conversion preserves absolute note time',()=>{let p=music.demoProject();p.beats=2;p.bars=[{chord:'Dm',section:'A1',melody:[{pitch:60,start:0,duration:1}]},{chord:'Dm',section:'A1',melody:[{pitch:62,start:1,duration:0.5}]}];let out=music.convertTwoFourToFour(p);assert.equal(out.beats,4);assert.equal(out.bars.length,1);assert.equal(out.bars[0].melody[1].start,3);});
test('two four conversion retains mid-measure harmony',()=>{let p=music.demoProject();p.beats=2;p.bars=[{chord:'Dm',section:'A1',melody:[]},{chord:'A7',section:'A1',melody:[]}];const out=music.convertTwoFourToFour(p);assert.equal(out.bars[0].chord,'Dm,A7');});
test('pizzicato and double stop export',()=>{let s=music.generate(project);const xml=io.exportMusicXml(project,s);assert.match(xml,/pizz\./);assert.match(xml,/<chord\/>/);});

test('non-destructive transpose moves notes and chord symbols',()=>{
  const p=music.demoProject(),s=music.generate(p),initial=s.Piano[0].pitch;
  p.transposeSemitones=3;
  const xml=io.exportMusicXml(p,s);
  assert.equal(s.Piano[0].pitch,initial);
  assert.equal(music.transposeScore(s,3).Piano[0].pitch,initial+3);
  assert.equal(music.transposeChord('Dm/A',3),'Fm/C');
  assert.match(xml,/<kind text="Fm">/);
  assert.deepEqual(Array.from(io.validateMusicXmlDurations(xml,4)),[]);
});
test('eight-bar phrasing and individual measure override',()=>{
  const p=music.demoProject();
  assert.equal(music.measureArticulation(p,'Violin I',0),'marcato_staccato');
  assert.equal(music.measureArticulation(p,'Violin I',8),'legato');
  p.articulation.overrides['Violin I:0']='legato';
  p.articulation.overrides['Bandoneon II:0']='staccato';
  const score=music.generate(p);
  assert.ok(score['Violin I'].filter(n=>n.start<4).every(n=>n.articulation==='legato'));
  assert.ok(score['Bandoneon II'].filter(n=>n.start<4).every(n=>n.articulation==='staccato'));
  const xml=io.exportMusicXml(p,score);
  assert.match(xml,/<staccato\/>/);
  assert.deepEqual(Array.from(io.validateMusicXmlDurations(xml,4)),[]);
});
test('independent articulation from violin to bandoneon with explicit rests preserved',()=>{
  const p=music.demoProject();p.roles.A1['Bandoneon II']='rest';
  p.articulation.overrides['Bandoneon II:0']='marcato_staccato';
  assert.equal(music.generate(p)['Bandoneon II'].filter(n=>n.start<32).length,0);
});
test('measure-specific role overrides are isolated and explicit rests honored',()=>{
  const p=music.demoProject();p.measureRoles={'Violin II:0':'rest','Bandoneon II:0':'melody'};
  const score=music.generate(p);
  assert.equal(score['Violin II'].filter(n=>n.start<4).length,0);
  assert.ok(score['Violin II'].some(n=>n.start>=4&&n.start<8));
  assert.ok(score['Bandoneon II'].some(n=>n.start<4));
  assert.deepEqual(Array.from(io.validateMusicXmlDurations(io.exportMusicXml(p,score),4)),[]);
});
test('violin measure-specific technique changes notes and notation',()=>{
  const p=music.demoProject();p.measureRoles={'Violin I:0':'chords'};
  p.measureViolinTechniques={'Violin I:0':'pizzicato'};
  const score=music.generate(p);
  assert.ok(score['Violin I'].filter(n=>n.start<4).length>0);
  assert.ok(score['Violin I'].filter(n=>n.start<4).every(n=>n.technique==='pizzicato'));
  assert.match(io.exportMusicXml(p,score),/pizz\./);
});
test('articulation override coexists with independent measure role',()=>{
  const p=music.demoProject();p.measureRoles={'Bandoneon II:1':'chords'};
  p.articulation.overrides['Bandoneon II:1']='staccato';
  const notes=music.generate(p)['Bandoneon II'].filter(n=>n.start>=4&&n.start<8);
  assert.ok(notes.length>0);assert.ok(notes.every(n=>n.articulation==='staccato'));
});
// v0.7 multi-chord measure regression tests
test('comma chord entry maps D,G to beat three in 4/4',()=>{assert.equal(music.chordAt('D,G',4,0),'D');assert.equal(music.chordAt('D,G',4,1),'D');assert.equal(music.chordAt('D,G',4,2),'G');assert.equal(music.chordAt('D,G',4,3),'G');});
test('four-slot entry changes harmony on beat four',()=>{assert.equal(music.chordAt('D,D,D,G',4,2),'D');assert.equal(music.chordAt('D,D,D,G',4,3),'G');});
test('chord entry validates empty and excessive slots',()=>{assert.throws(()=>music.parseChordSequence('D,,G',4),/Invalid chord/);assert.throws(()=>music.parseChordSequence('D,D,D,G,A',4),/At most/);assert.throws(()=>music.parseChordSequence('H7',4),/Invalid chord/);});
test('piano follows beat four chord change',()=>{let p=music.demoProject();p.bars=p.bars.slice(0,1);p.bars[0].chord='D,D,D,G';p.roles.A1.Piano='chords';const notes=music.generate(p).Piano;const beat4=notes.filter(n=>n.start>=3&&n.start<4);assert.ok(beat4.length);assert.ok(beat4.every(n=>music.chordTones('G').includes(n.pitch%12)),JSON.stringify(beat4));});
test('MusicXML exports correctly offset multiple harmonies and complete measures',()=>{let p=music.demoProject();p.bars=p.bars.slice(0,2);p.bars[0].chord='D,G';p.bars[1].chord='D,D,D,G';const xml=io.exportMusicXml(p,music.generate(p));assert.match(xml,/<kind text="G">other<\/kind><offset>960<\/offset>/);assert.match(xml,/<kind text="G">other<\/kind><offset>1440<\/offset>/);assert.deepEqual(Array.from(io.validateMusicXmlDurations(xml,4)),[]);});
test('global transpose applies to each harmony in a measure',()=>{let p=music.demoProject();p.bars=p.bars.slice(0,1);p.bars[0].chord='D,G';p.transposeSemitones=2;const xml=io.exportMusicXml(p,music.generate(p));assert.match(xml,/<kind text="E">other<\/kind>/);assert.match(xml,/<kind text="A">other<\/kind>/);});

// v0.8 blank song regression tests
test('blank song has no demo melody or chord symbols',()=>{
  const p=music.blankProject();assert.equal(p.bars.length,80);assert.equal(p.beats,4);
  assert.ok(p.bars.every(b=>b.chord===''&&b.melody.length===0));
  assert.equal(p.bars[15].section,'A');assert.equal(p.bars[16].section,'B');assert.equal(p.bars[32].section,'C');assert.equal(p.bars[64].section,'E');
});
test('blank song generates no invented notes',()=>{
  const p=music.blankProject({measures:8});const s=music.generate(p);
  for(const inst of music.INSTRUMENTS)assert.equal(s[inst].length,0,inst);
});
test('blank song exports complete MusicXML rest measures without fake harmony',()=>{
  const p=music.blankProject({measures:8});const xml=io.exportMusicXml(p,music.generate(p));
  assert.deepEqual(Array.from(io.validateMusicXmlDurations(xml,4)),[]);
  assert.doesNotMatch(xml,/<harmony>/);assert.match(xml,/<rest\/>/);
});
test('blank song chord editor can clear harmony; entered chord generates accompaniment',()=>{
  const p=music.blankProject({measures:8});
  assert.equal(music.parseChordSequence('',4).length,0);assert.equal(music.chordAt('',4,2),'');
  p.bars[0].chord='Dm,A7';const s=music.generate(p);
  assert.ok(s.Piano.some(n=>n.start<4));assert.ok(s['Bandoneon II'].some(n=>n.start<4));
  assert.ok(s.Piano.every(n=>n.start<4));
});
test('blank melody without harmony does not create imaginary chord backing',()=>{
  const p=music.blankProject({measures:8});p.bars[0].melody=[{pitch:74,start:0,duration:1}];
  const s=music.generate(p);
  assert.ok(s['Violin I'].length>0);assert.equal(s.Piano.length,0);assert.equal(s.Contrabass.length,0);
});
test('blank song validates input options',()=>{
  assert.throws(()=>music.blankProject({measures:0}),/sections|measures/);
  assert.throws(()=>music.blankProject({beats:5}),/Choose/);
  assert.throws(()=>music.blankProject({bpm:999}),/Tempo/);
});

// v0.9 section-specific key signatures
 test('key signatures include major and minor circle of fifths',()=>{
   assert.equal(music.parseKeySignature('Dm').fifths,-1);
   assert.equal(music.parseKeySignature('F').fifths,-1);
   assert.equal(music.parseKeySignature('Gm').fifths,-2);
   assert.equal(music.parseKeySignature('D').fifths,2);
   assert.throws(()=>music.parseKeySignature('H#'),/Unsupported/);
 });
 test('demo sections alternate minor and relative major keys',()=>{
   const p=music.demoProject();assert.equal(music.sectionKey(p,'A1'),'Dm');assert.equal(music.sectionKey(p,'B1'),'F');assert.equal(music.sectionKey(p,'A2'),'Dm');
 });
 test('MusicXML key changes appear at section boundaries on every part',()=>{
   const p=music.demoProject();p.bars=p.bars.slice(0,17);p.sectionKeys={A1:'Dm',B1:'G',A2:'Dm'};
   const xml=io.exportMusicXml(p,music.generate(p));
   const first=xml.match(/<part id="P1">([\s\S]*?)<\/part>/)[1];
   assert.match(first,/<measure implicit="no" number="1"><attributes><divisions>480<\/divisions><key><fifths>-1<\/fifths><mode>minor<\/mode><\/key>/);
   assert.match(first,/<measure implicit="no" number="9"><attributes><key><fifths>1<\/fifths><mode>major<\/mode><\/key><\/attributes>/);
   assert.match(first,/<measure implicit="no" number="17"><attributes><key><fifths>-1<\/fifths><mode>minor<\/mode><\/key><\/attributes>/);
   assert.equal((xml.match(/<key><fifths>1<\/fifths><mode>major<\/mode><\/key>/g)||[]).length,music.INSTRUMENTS.length);
   assert.deepEqual(Array.from(io.validateMusicXmlDurations(xml,4)),[]);
 });
 test('relative major/minor is explicitly labeled even when fifths unchanged',()=>{
   const p=music.demoProject();p.bars=p.bars.slice(0,9);
   const xml=io.exportMusicXml(p,music.generate(p));
   assert.match(xml,/<rehearsal[^>]*>A<\/rehearsal>/);assert.match(xml,/<rehearsal[^>]*>B<\/rehearsal>/);assert.match(xml,/<words>Dm minor<\/words>/);assert.match(xml,/<words>F major<\/words>/);
   assert.match(xml,/<key><fifths>-1<\/fifths><mode>major<\/mode><\/key>/);
 });
 test('global transpose shifts key signatures while leaving original project untouched',()=>{
   const p=music.demoProject();p.bars=p.bars.slice(0,9);p.transposeSemitones=2;
   const xml=io.exportMusicXml(p,music.generate(p));
   assert.equal(p.sectionKeys.A1,'Dm');assert.equal(p.sectionKeys.B1,'F');
   assert.equal(music.transposeKeySignature('Dm',2),'Em');assert.equal(music.transposeKeySignature('F',2),'G');
   assert.match(xml,/<key><fifths>1<\/fifths><mode>minor<\/mode><\/key>/);
   assert.match(xml,/<key><fifths>1<\/fifths><mode>major<\/mode><\/key>/);
 });
 test('legacy project key inference is editable and does not change chord symbols',()=>{
   const p=music.demoProject();const chords=p.bars.map(b=>b.chord);delete p.sectionKeys;
   const inferred=music.inferSectionKeys(p);assert.equal(inferred.A1,'Dm');assert.equal(inferred.B1,'F');
   assert.deepEqual(p.bars.map(b=>b.chord),chords);
 });
test('D minor uses B-flat signature spelling and C-sharp harmonic leading tone',()=>{
  const p=music.blankProject({measures:1});p.sectionKeys.A='Dm';
  const score=music.generate(p);score['Violin I']=[{pitch:70,start:0,duration:1},{pitch:73,start:1,duration:1}];
  const xml=io.exportMusicXml(p,score);
  const violin=xml.match(/<part id="P3">([\s\S]*?)<\/part>/)[1];
  assert.match(violin,/<step>B<\/step><alter>-1<\/alter><octave>4<\/octave>/);
  assert.match(violin,/<step>C<\/step><alter>1<\/alter><octave>5<\/octave>/);
});
test('enharmonic octave and double-sharp spelling stay at concert pitch',()=>{
  const p=music.blankProject({measures:1});p.sectionKeys.A='Cb';
  const score=music.generate(p);score['Violin I']=[{pitch:59,start:0,duration:1}];
  const flat=io.exportMusicXml(p,score);
  assert.match(flat,/<step>C<\/step><alter>-1<\/alter><octave>4<\/octave>/);
  p.sectionKeys.A='A#m';score['Violin I']=[{pitch:69,start:0,duration:1}];
  const sharp=io.exportMusicXml(p,score);
  assert.match(sharp,/<step>G<\/step><alter>2<\/alter><octave>4<\/octave>/);
});
// v1.0 editable section structure and MusicXML rehearsal marks
 test('blank defaults to five sixteen-measure sections A through E',()=>{
   const p=music.blankProject();assert.equal(p.bars.length,80);
   assert.deepEqual(Array.from(music.sectionSpans(p),s=>[s.label,s.measures]),[['A',16],['B',16],['C',16],['D',16],['E',16]]);
   assert.equal(Object.keys(p.sectionKeys).length,5);
 });
 test('default eighty-bar export includes A through E rehearsal marks',()=>{
   const p=music.blankProject();const xml=io.exportMusicXml(p,music.generate(p));
   assert.deepEqual(Array.from(io.validateMusicXmlDurations(xml,4)),[]);
   const first=xml.match(/<part id="P1">([\s\S]*?)<\/part>/)[1];
   assert.deepEqual([...first.matchAll(/<rehearsal[^>]*>([A-Z]+)<\/rehearsal>/g)].map(x=>x[1]),['A','B','C','D','E']);
 });
 test('custom creation supports varying section lengths',()=>{
   const p=music.blankProject({sections:3,measuresPerSection:[8,12,16]});
   assert.equal(p.bars.length,36);assert.deepEqual(Array.from(music.sectionSpans(p),s=>s.start),[0,8,20]);
   assert.throws(()=>music.blankProject({sections:3,measuresPerSection:[8,12]}),/measures/);
 });
 test('section resize retains content and remaps measure overrides',()=>{
   const p=music.blankProject({sections:2,measuresPerSection:[4,4]});
   p.bars[4].chord='G7';p.bars[4].melody=[{pitch:62,start:0,duration:1}];
   p.measureRoles={'Violin II:4':'melody'};p.articulation.overrides['Violin II:4']='legato';
   p.sectionKeys.B='G';p.generatedScore=music.generate(p);p.protectedBars['Violin II:4']=true;
   const r=music.resizeSections(p,[6,3,2]);
   assert.equal(r.bars.length,11);assert.equal(r.bars[6].chord,'G7');assert.equal(r.bars[6].melody[0].pitch,62);
   assert.equal(r.measureRoles['Violin II:6'],'melody');assert.equal(r.articulation.overrides['Violin II:6'],'legato');
   assert.equal(r.sectionKeys.B,'G');assert.equal(r.bars[9].section,'C');
   assert.equal(r.generatedScore,undefined);assert.equal(Object.keys(r.protectedBars).length,0);
   assert.deepEqual(Array.from(io.validateMusicXmlDurations(io.exportMusicXml(r,music.generate(r)),4)),[]);
 });
 test('removed measures do not retain stale overrides',()=>{
   const p=music.blankProject({sections:2,measuresPerSection:[4,4]});p.measureRoles={'Piano:3':'rest','Piano:7':'melody'};
   const r=music.resizeSections(p,[2,2]);assert.equal(r.bars.length,4);assert.equal(Object.keys(r.measureRoles).length,0);
 });
 test('MusicXML exports sequential rehearsal letters at every section boundary',()=>{
   const p=music.blankProject({sections:5,measuresPerSection:[2,3,1,4,2]});
   p.sectionKeys.B='Dm';p.sectionKeys.C='F';
   const xml=io.exportMusicXml(p,music.generate(p));
   const first=xml.match(/<part id="P1">([\s\S]*?)<\/part>/)[1];
   assert.deepEqual([...first.matchAll(/<rehearsal[^>]*>([A-Z]+)<\/rehearsal>/g)].map(x=>x[1]),['A','B','C','D','E']);
   assert.equal((xml.match(/<rehearsal /g)||[]).length,5);
   assert.match(xml,/<measure implicit="no" number="3"><attributes><key><fifths>-1<\/fifths><mode>minor<\/mode><\/key><\/attributes>/);
   assert.deepEqual(Array.from(io.validateMusicXmlDurations(xml,4)),[]);
 });
 test('legacy A1 B1 section names export as sequential A B rehearsal letters',()=>{
   const p=music.demoProject();p.bars=p.bars.slice(0,17);
   const xml=io.exportMusicXml(p,music.generate(p));
   const first=xml.match(/<part id="P1">([\s\S]*?)<\/part>/)[1];
   assert.deepEqual([...first.matchAll(/<rehearsal[^>]*>([A-Z]+)<\/rehearsal>/g)].map(x=>x[1]),['A','B','C']);
 });
// v1.1 blank-song setup exposes independent lengths at creation time.
test('blank song accepts per-section lengths directly from creation setup',()=>{
  const lengths=[16,8,12,16,4];
  const p=music.blankProject({title:'Custom form',sections:5,measuresPerSection:lengths});
  assert.deepEqual(Array.from(music.sectionSpans(p),s=>[s.label,s.measures]),[['A',16],['B',8],['C',12],['D',16],['E',4]]);
  assert.equal(p.bars.length,56);
  assert.ok(p.bars.every(b=>b.chord===''&&b.melody.length===0));
});
test('custom blank-song sections have sequential MuseScore rehearsal letters',()=>{
  const p=music.blankProject({sections:3,measuresPerSection:[2,4,3]});
  const xml=io.exportMusicXml(p,music.generate(p));
  const first=xml.match(/<part id="P1">([\s\S]*?)<\/part>/)[1];
  assert.deepEqual([...first.matchAll(/<rehearsal[^>]*>([A-Z]+)<\/rehearsal>/g)].map(x=>x[1]),['A','B','C']);
  assert.deepEqual(Array.from(io.validateMusicXmlDurations(xml,4)),[]);
});
test('blank-song UI uses per-section measure inputs rather than a single common length',()=>{
  const source=fs.readFileSync(path.join(root,'src/App.vue'),'utf8');
  assert.match(source,/v-for="\(length,i\) in newSongLengths"/);
  assert.match(source,/v-model\.number="newSongLengths\[i\]"/);
  assert.match(source,/measuresPerSection:\[\.\.\.newSongLengths\.value\]/);
  assert.doesNotMatch(source,/newSongMeasuresPerSection/);
});
 
// v1.2 guided instrument note editor tests
 test('note editor reads section key, measure role and instrument difficulty',()=>{
  const p=music.blankProject({sections:2,measuresPerSection:[2,2]});
  p.sectionKeys.B='Dm';p.measureRoles={'Violin II:2':'chords'};
  p.measureViolinTechniques={'Violin II:2':'pizzicato'};
  p.instrumentSettings['Violin II'].difficulty='advanced';
  const ctx=music.noteEditorContext(p,'Violin II',2);
  assert.equal(ctx.key,'Dm');assert.equal(ctx.mode,'minor');assert.equal(ctx.role,'chords');
  assert.equal(ctx.difficulty,'advanced');assert.equal(ctx.technique,'pizzicato');
  assert.equal(ctx.range[0],55);
 });
 test('major and natural minor pitch-class guides differ',()=>{
  assert.ok(music.keyPitchClasses('Dm').includes(70%12)); // Bb
  assert.ok(!music.keyPitchClasses('F').includes(66%12)); // F#
  assert.ok(music.keyPitchClasses('F').includes(69%12)); // A
 });
 test('note editor identifies chord changes within the same measure',()=>{
  const p=music.blankProject({sections:1,measuresPerSection:1});
  p.bars[0].chord='D,D,D,G';p.sectionKeys.A='D';
  assert.equal(music.noteEditorPitchClass(p,'Piano',0,2,66),'chord'); // F# in D
  assert.equal(music.noteEditorPitchClass(p,'Piano',0,3,67),'chord'); // G root
  assert.equal(music.noteEditorPitchClass(p,'Piano',0,2,67),'key');
 });
 test('new notes inherit role-based duration and violin pizzicato',()=>{
  const p=music.blankProject({sections:1,measuresPerSection:1});
  p.roles.A['Violin II']='chords';p.measureViolinTechniques={'Violin II:0':'pizzicato'};
  const n=music.suggestedEditorNote(p,'Violin II',0,0,69);
  assert.equal(n.duration,1);assert.equal(n.technique,'pizzicato');assert.equal(n.source,'manual');
  assert.equal(n.articulation,'marcato_staccato');assert.equal(n.gate,0.58);
 });
 test('manual note edits survive regeneration and export to MusicXML',()=>{
  const p=music.blankProject({sections:1,measuresPerSection:2});
  p.bars[0].chord='Dm';p.bars[1].chord='A7';
  const generated=music.generate(p);
  const originalSecond=generated.Piano.filter(n=>n.start>=4).length;
  const n=music.suggestedEditorNote(p,'Piano',0,1,65,0.5);
  const edited=music.replaceInstrumentMeasure(p,generated,'Piano',0,[n]);
  assert.equal(edited.protectedBars['Piano:0'],true);
  assert.equal(edited.importedScore.Piano.filter(n=>n.start<4).length,1);
  const regenerated=music.mergeScores(edited,music.generate(edited));
  assert.equal(regenerated.Piano.filter(n=>n.start<4).length,1);
  assert.equal(regenerated.Piano.filter(n=>n.start<4)[0].pitch,65);
  assert.equal(regenerated.Piano.filter(n=>n.start>=4).length,originalSecond);
  const xml=io.exportMusicXml(edited,regenerated);
  assert.deepEqual(Array.from(io.validateMusicXmlDurations(xml,4)),[]);
  assert.match(xml,/<step>F<\/step>/);
 });
 test('clearing an instrument measure remains silent after regenerate',()=>{
  const p=music.blankProject({sections:1,measuresPerSection:1});p.bars[0].chord='Dm';
  const edited=music.replaceInstrumentMeasure(p,music.generate(p),'Piano',0,[]);
  assert.equal(music.mergeScores(edited,music.generate(edited)).Piano.length,0);
 });
 test('restoring generated measure removes only its protection',()=>{
  const p=music.blankProject({sections:1,measuresPerSection:2});p.bars[0].chord='Dm';p.bars[1].chord='G7';
  const score=music.generate(p);
  const a=music.replaceInstrumentMeasure(p,score,'Piano',0,[]);
  const b=music.replaceInstrumentMeasure(a,a.generatedScore,'Violin I',1,[]);
  const reset=music.resetInstrumentMeasure(b,'Piano',0);
  assert.equal(Boolean(reset.protectedBars['Piano:0']),false);
  assert.equal(reset.protectedBars['Violin I:1'],true);
  assert.ok(reset.generatedScore.Piano.some(n=>n.start<4));
  assert.equal(reset.generatedScore['Violin I'].filter(n=>n.start>=4).length,0);
 });
 test('note editor rejects out-of-range pitches and measure-crossing events',()=>{
  const p=music.blankProject({sections:1,measuresPerSection:1});const s=music.generate(p);
  assert.throws(()=>music.suggestedEditorNote(p,'Contrabass',0,0,90),/outside/);
  assert.throws(()=>music.replaceInstrumentMeasure(p,s,'Piano',0,[{pitch:60,start:3.5,duration:1}]),/outside measure/);
  assert.throws(()=>music.replaceInstrumentMeasure(p,s,'Piano',0,[{pitch:10,start:0,duration:1}]),/outside measure/);
 });
 test('manual note in blank song is preserved without inventing other parts',()=>{
  const p=music.blankProject({sections:1,measuresPerSection:1});const score=music.generate(p);
  const edited=music.replaceInstrumentMeasure(p,score,'Violin I',0,[music.suggestedEditorNote(p,'Violin I',0,0,74)]);
  const regenerated=music.mergeScores(edited,music.generate(edited));
  assert.equal(regenerated['Violin I'].length,1);
  assert.equal(regenerated.Piano.length,0);
  assert.deepEqual(Array.from(io.validateMusicXmlDurations(io.exportMusicXml(edited,regenerated),4)),[]);
 });
 test('note editor UI includes piano roll, harmonic colors and reset',()=>{
  const src=fs.readFileSync(path.join(root,'src/App.vue'),'utf8');
  assert.match(src,/class="note-grid"/);assert.match(src,/noteEditorPitchClass/);
  assert.match(src,/replaceInstrumentMeasure/);assert.match(src,/restoreNoteMeasure/);
  assert.match(src,/>Note editor<\/button>/);
 });
// v1.3 inline section-aware lead sheet and overview harmony UI.
test('lead sheet shows section boundaries, keys and measure ranges',()=>{
  const src=fs.readFileSync(path.join(root,'src/App.vue'),'utf8');
  assert.match(src,/class="lead-sections"/);
  assert.match(src,/sectionSpans\(project\)/);
  assert.match(src,/class="lead-key-label"/);
  assert.match(src,/Measures \{\{span.start\+1\}\}–\{\{span.start\+span.measures\}\}/);
});
test('lead sheet and overview both offer direct harmony inputs',()=>{
  const src=fs.readFileSync(path.join(root,'src/App.vue'),'utf8');
  assert.match(src,/class="lead-chord-label"/);
  assert.match(src,/class="measure-chord-inline"/);
  assert.match(src,/@blur="finishLeadChord\(span.start\+offset-1,\$event\)"/);
  assert.match(src,/@change="commitInlineChord\(i,\$event\)"/);
  assert.match(src,/@keydown.esc.prevent="cancelInlineChord/);
});
test('harmony changes preserve manually protected notes on regeneration',()=>{
  let p=music.blankProject({sections:1,measuresPerSection:2});
  p.bars[0].chord='Dm';p.bars[1].chord='Dm';
  const score=music.generate(p);
  p=music.replaceInstrumentMeasure(p,score,'Violin I',0,[{pitch:74,start:0,duration:1}]);
  p.bars[0].chord='G7,Dm';
  const refreshed=music.mergeScores(p,music.generate(p));
  assert.equal(refreshed['Violin I'].filter(n=>n.start<4).length,1);
  assert.equal(refreshed['Violin I'].find(n=>n.start<4).pitch,74);
  assert.ok(refreshed.Piano.some(n=>n.start<4));
  assert.deepEqual(Array.from(io.validateMusicXmlDurations(io.exportMusicXml(p,refreshed),4)),[]);
});

// v1.4: section-to-section chord copying, including unequal lengths.
test('copying section chords preserves all chord slots, melody, keys and source',()=>{
  const p=music.blankProject({sections:2,measuresPerSection:[3,3]});
  p.bars[0].chord='Dm,A7';p.bars[1].chord='D,D,D,G';p.bars[2].chord='Fmaj7';
  p.bars[3].chord='C';p.bars[4].chord='G7';p.bars[5].chord='Am';
  p.bars[3].melody=[{pitch:72,start:0,duration:1}];
  p.sectionKeys.A='Dm';p.sectionKeys.B='F';
  const result=music.copySectionChords(p,0,1);
  assert.deepEqual(result.project.bars.slice(3).map(b=>b.chord),['Dm,A7','D,D,D,G','Fmaj7']);
  assert.deepEqual(p.bars.slice(3).map(b=>b.chord),['C','G7','Am']);
  assert.deepEqual(result.project.bars.slice(0,3).map(b=>b.chord),['Dm,A7','D,D,D,G','Fmaj7']);
  assert.equal(result.project.bars[3].melody[0].pitch,72);
  assert.equal(result.project.sectionKeys.B,'F');
  assert.equal(result.copied,3);assert.equal(result.changed,3);
  assert.deepEqual(Array.from(io.validateMusicXmlDurations(io.exportMusicXml(result.project,music.generate(result.project)),4)),[]);
});
test('unequal section copy preserves excess destination measures',()=>{
  const p=music.blankProject({sections:2,measuresPerSection:[2,4]});
  p.bars[0].chord='Dm';p.bars[1].chord='A7';
  p.bars[2].chord='C';p.bars[3].chord='G';p.bars[4].chord='F';p.bars[5].chord='C7';
  const result=music.copySectionChords(p,0,1);
  assert.deepEqual(result.project.bars.slice(2).map(b=>b.chord),['Dm','A7','F','C7']);
  assert.equal(result.copied,2);assert.equal(result.sourceMeasures,2);assert.equal(result.destinationMeasures,4);
  const reverse=music.copySectionChords(p,1,0);
  assert.deepEqual(reverse.project.bars.slice(0,2).map(b=>b.chord),['C','G']);
  assert.equal(reverse.copied,2);
});
test('copying blank chords clears corresponding destination chord only',()=>{
  const p=music.blankProject({sections:2,measuresPerSection:2});
  p.bars[0].chord='';p.bars[1].chord='Dm';p.bars[2].chord='G7';p.bars[3].chord='C';
  const result=music.copySectionChords(p,0,1);
  assert.deepEqual(Array.from(result.project.bars.slice(2).map(b=>b.chord)),['','Dm']);
});
test('copy rejects invalid selections and invalid source harmony without partial edits',()=>{
  const p=music.blankProject({sections:2,measuresPerSection:2});
  assert.throws(()=>music.copySectionChords(p,0,0),/different/);
  assert.throws(()=>music.copySectionChords(p,-1,1),/existing/);
  assert.throws(()=>music.copySectionChords(p,0,2),/existing/);
  p.bars[0].chord='Dm';p.bars[1].chord='invalid chord';
  assert.throws(()=>music.copySectionChords(p,0,1),/Invalid chord/);
  assert.deepEqual(Array.from(p.bars.slice(2).map(b=>b.chord)),['','']);
});
test('copy invalidates generated preview while retaining protected manual notes',()=>{
  let p=music.blankProject({sections:2,measuresPerSection:1});
  p.bars[0].chord='Dm';p.bars[1].chord='G7';
  p=music.replaceInstrumentMeasure(p,music.generate(p),'Violin I',1,[{pitch:74,start:4,duration:1}]);
  const result=music.copySectionChords(p,0,1);
  assert.equal(result.project.generatedScore,undefined);
  assert.equal(result.project.protectedBars['Violin I:1'],true);
  assert.equal(result.project.importedScore['Violin I'][0].pitch,74);
  const merged=music.mergeScores(result.project,music.generate(result.project));
  assert.equal(merged['Violin I'].find(n=>n.start===4).pitch,74);
  assert.deepEqual(Array.from(io.validateMusicXmlDurations(io.exportMusicXml(result.project,merged),4)),[]);
});
test('lead sheet exposes section chord copy controls and confirmation',()=>{
  const src=fs.readFileSync(path.join(root,'src/App.vue'),'utf8');
  assert.match(src,/beginSectionCopy\(si\)/);assert.match(src,/copySourceIndex/);
  assert.match(src,/copyTargetIndex/);assert.match(src,/applySectionChordCopy/);
  assert.match(src,/window.confirm\(confirmation\)/);
});

// v1.6: bandoneon defaults and keyboard-first chord completion
 test('new songs default Bandoneon I to follow Violin II in every section',()=>{
   const p=music.blankProject();
   for(const label of ['A','B','C','D','E'])assert.deepEqual({...p.orchestration.bandoneon[label]['Bandoneon I']},{target:'Violin II',method:'adapt'});
   assert.equal(p.orchestration.bandoneon.A['Bandoneon II'],undefined);
   const demo=music.demoProject();
   for(const label of ['A1','B1','A2','B2','C'])assert.equal(demo.orchestration.bandoneon[label]['Bandoneon I'].target,'Violin II');
 });
 test('newly added sections inherit Bandoneon I follow default, explicit settings survive resize',()=>{
   const p=music.blankProject({sections:1,measuresPerSection:2});
   p.orchestration.bandoneon.A['Bandoneon I']={target:'independent',method:'exact'};
   const resized=music.resizeSections(p,[2,2]);
   assert.equal(resized.orchestration.bandoneon.A['Bandoneon I'].target,'independent');
   assert.equal(resized.orchestration.bandoneon.B['Bandoneon I'].target,'Violin II');
 });
 test('completions prefilter the current chord root and quality',()=>{
   assert.deepEqual(Array.from(music.chordCompletions('Dm,A',4,5)).slice(0,3),['A','Am','A7']);
   assert.deepEqual(Array.from(music.chordCompletions('Ddim',4)),['Ddim','Ddim7']);
   assert.ok(music.chordCompletions('C',1).includes('Cm7b5'));
   assert.deepEqual(Array.from(music.chordCompletions('Dm,',3)),[]);
 });
 test('completion replaces only chord under caret, preserving other comma slots',()=>{
   assert.deepEqual({...music.completeChordToken('Dm,A7',4,'Adim7')},{value:'Dm,Adim7',caret:8});
   assert.equal(music.completeChordToken('Dm,A7,G7',1,'Ddim').value,'Ddim,A7,G7');
   assert.equal(music.completeChordToken('Dm,A7,G7',5,'Amaj7').value,'Dm,Amaj7,G7');
   assert.throws(()=>music.completeChordToken('Dm,A7',4,'A7,G7'),/Invalid chord completion/);
 });
 test('diminished and half-diminished chord spellings have distinct tones',()=>{
   assert.deepEqual(Array.from(music.chordTones('Ddim')),[2,5,8]);
   assert.deepEqual(Array.from(music.chordTones('Ddim7')),[2,5,8,11]);
   assert.deepEqual(Array.from(music.chordTones('Dm7b5')),[2,5,8,0]);
   assert.deepEqual(Array.from(music.chordTones('Dø7')),[2,5,8,0]);
   for(const chord of ['Ddim','Ddim7','Dm7b5','Dø7'])assert.equal(music.parseChordSequence(chord,4).length,1);
 });
 test('lead-sheet keyboard navigation and contextual dropdown are wired',()=>{
   const src=fs.readFileSync(path.join(root,'src/App.vue'),'utf8');
   for(const name of ['handleLeadChordKey','leadChordInput','chooseLeadChord','chordCompletions','completeChordToken','@keydown="handleLeadChordKey','@mousedown.prevent'])assert.ok(src.includes(name),name);
   assert.ok(src.includes("event.key==='Tab'"));assert.ok(src.includes("event.key==='Enter'"));
 });

// v2.1: grand-staff piano and comma-safe chord completion.
test('piano staff pitch assignment uses middle C by default and editable split',()=>{
  assert.equal(music.pianoStaffForPitch(59),2);
  assert.equal(music.pianoStaffForPitch(60),1);
  assert.equal(music.pianoStaffForPitch(62,64),2);
  assert.equal(music.pianoStaffForPitch(64,64),1);
  assert.throws(()=>music.pianoStaffForPitch(60,80),/split/);
});
test('MusicXML piano part has two clefs, two voices, two staves and a measure backup',()=>{
  const p=music.blankProject({sections:1,measuresPerSection:1});p.bars[0].chord='C,G';
  const s=music.generate(p);
  s.Piano=[{pitch:48,start:0,duration:1},{pitch:52,start:0,duration:1},{pitch:64,start:0,duration:1},{pitch:67,start:0,duration:1},{pitch:55,start:2,duration:1},{pitch:72,start:2,duration:1}];
  const xml=io.exportMusicXml(p,s);
  const piano=xml.match(/<part id="P1">([\s\S]*?)<\/part>/)?.[1];
  assert.ok(piano);
  assert.match(piano,/<staves>2<\/staves>/);
  assert.match(piano,/<clef number="1"><sign>G<\/sign><line>2<\/line><\/clef>/);
  assert.match(piano,/<clef number="2"><sign>F<\/sign><line>4<\/line><\/clef>/);
  assert.match(piano,/<voice>1<\/voice>/);assert.match(piano,/<voice>2<\/voice>/);
  assert.match(piano,/<staff>1<\/staff>/);assert.match(piano,/<staff>2<\/staff>/);
  assert.match(piano,/<backup><duration>1920<\/duration><\/backup>/);
  assert.deepEqual(Array.from(io.validateMusicXmlDurations(xml,4)),[]);
});
test('piano simultaneous upper/lower notes survive staff splitting without transposing',()=>{
  const p=music.blankProject({sections:1,measuresPerSection:1});
  const s=music.generate(p);s.Piano=[{pitch:59,start:0,duration:1},{pitch:60,start:0,duration:1}];
  const xml=io.exportMusicXml(p,s);
  const upper=xml.match(/<voice>1<\/voice>/g)??[];
  const lower=xml.match(/<voice>2<\/voice>/g)??[];
  assert.ok(upper.length>0&&lower.length>0);
  assert.deepEqual(Array.from(io.validateMusicXmlDurations(xml,4)),[]);
  p.transposeSemitones=2;
  assert.deepEqual(Array.from(io.validateMusicXmlDurations(io.exportMusicXml(p,s),4)),[]);
});
test('custom piano split persists as a project field and moves notes between staves',()=>{
  const p=music.blankProject({sections:1,measuresPerSection:1});p.pianoSplitPitch=65;
  const s=music.generate(p);s.Piano=[{pitch:64,start:0,duration:1},{pitch:65,start:0,duration:1}];
  const xml=io.exportMusicXml(p,s);
  const body=xml.match(/<part id="P1">([\s\S]*?)<\/part>/)?.[1]??'';
  assert.match(body,/<step>E<\/step>[\s\S]*?<staff>2<\/staff>/);
  assert.match(body,/<step>F<\/step>[\s\S]*?<staff>1<\/staff>/);
  assert.equal(JSON.parse(JSON.stringify(p)).pianoSplitPitch,65);
});
test('comma-delimited repeated chords stay separate during completion',()=>{
  assert.deepEqual(Array.from(music.parseChordSequence('C,C',4)).map(x=>x.beat),[0,2]);
  assert.equal(music.completeChordToken('C,C',3,'Cm7').value,'C,Cm7');
  assert.equal(music.completeChordToken('C,C,C,G',3,'Cdim').value,'C,Cdim,C,G');
  assert.equal(music.completeChordToken('C,C,C,G',7,'G7').value,'C,C,C,G7');
  assert.ok(music.chordCompletions('C,C',3).includes('Cdim7'));
});
test('lead chord input defers validation until blur or explicit navigation',()=>{
  const src=fs.readFileSync(path.join(root,'src/App.vue'),'utf8');
  const input=src.match(/<input :id="`lead-chord-\$\{span.start\+offset-1\}`"[\s\S]*?\/>/)?.[0];
  assert.ok(input);
  assert.ok(!input.includes('@change="commitInlineChord'));
  assert.match(input,/@input="updateLeadChord/);
  assert.match(input,/@blur="finishLeadChord/);
  assert.match(src,/input\.value=completed\.value/);
  assert.match(src,/completeChordToken\(input\.value,input\.selectionStart/);
});
test('piano editor has two simultaneous register grids and an editable split',()=>{
  const src=fs.readFileSync(path.join(root,'src/App.vue'),'utf8');
  assert.match(src,/v-for="staff in noteStaffViews"/);
  assert.match(src,/v-for="pitch in staff\.pitches"/);
  assert.match(src,/v-model\.number="pianoSplit"/);
  assert.match(src,/pianoTrebleCenter/);assert.match(src,/pianoBassCenter/);
  assert.match(src,/noteInst==='Piano'/);
});

// v1.9: written duration, tango gates, note editing and MusicXML markings
 test('tango articulation gates keep written duration separate from sounding length',()=>{
  const base={pitch:74,start:0,duration:1,velocity:80};
  const st={...base,articulation:'staccato'};
  const ma={...base,articulation:'marcato_staccato'};
  const le={...base,articulation:'legato'};
  assert.equal(music.noteSoundingDuration(st),0.28);
  assert.equal(music.noteSoundingDuration(ma),0.58);
  assert.equal(music.noteSoundingDuration(le),0.94);
  assert.equal(st.duration,1);assert.equal(ma.duration,1);
  assert.equal(music.noteSoundingVelocity(st),80);
  assert.equal(music.noteSoundingVelocity(ma),94);
  assert.equal(music.noteSoundingVelocity({...ma,velocity:125}),127);
 });
 test('generator no longer truncates written durations for staccato or marcato',()=>{
  const p=music.demoProject();p.bars=p.bars.slice(0,1);
  p.articulation.overrides['Violin I:0']='staccato';
  const st=music.generate(p)['Violin I'];
  p.articulation.overrides['Violin I:0']='marcato_staccato';
  const ma=music.generate(p)['Violin I'];
  assert.ok(st.length>0);assert.equal(st.length,ma.length);
  assert.deepEqual(Array.from(st.map(n=>n.duration)),Array.from(ma.map(n=>n.duration)));
  assert.ok(st.every(n=>n.articulation==='staccato'&&!n.accent));
  assert.ok(ma.every(n=>n.articulation==='marcato_staccato'&&n.accent));
  assert.ok(ma.every(n=>music.noteSoundingDuration(n)>music.noteSoundingDuration(st[ma.indexOf(n)])));
 });
 test('MusicXML writes staccato dots and marcato accents without changing rhythm',()=>{
  const p=music.blankProject({sections:1,measuresPerSection:1});
  const s=music.generate(p);
  s.Piano=[{pitch:60,start:0,duration:1,articulation:'staccato'},
    {pitch:62,start:1,duration:1,articulation:'marcato_staccato',accent:true},
    {pitch:64,start:2,duration:1,articulation:'legato'}];
  const xml=io.exportMusicXml(p,s);
  assert.match(xml,/<accent\/>/);
  assert.match(xml,/<staccato\/>/);
  assert.equal((xml.match(/<accent\/>/g)||[]).length,1);
  assert.doesNotMatch(xml,/<strong-accent/);
  assert.deepEqual(Array.from(io.validateMusicXmlDurations(xml,4)),[]);
 });
 test('custom gate changes playback but not MusicXML note/rest durations',()=>{
  const p=music.blankProject({sections:1,measuresPerSection:1});
  const s=music.generate(p);
  s.Piano=[{pitch:60,start:0,duration:1,gate:0.2,articulation:'staccato'}];
  const first=io.exportMusicXml(p,s);
  s.Piano[0].gate=0.9;
  const second=io.exportMusicXml(p,s);
  assert.equal(first,second);
  assert.equal(music.noteSoundingDuration(s.Piano[0]),0.9);
 });
 test('manually edited articulation and gate survive protection and regeneration',()=>{
  const p=music.blankProject({sections:1,measuresPerSection:1});
  p.bars[0].chord='Dm';
  const s=music.generate(p);
  const note={...music.suggestedEditorNote(p,'Piano',0,0,60),articulation:'marcato_staccato',gate:0.65,accent:true};
  const edited=music.replaceInstrumentMeasure(p,s,'Piano',0,[note]);
  const merged=music.mergeScores(edited,music.generate(edited));
  assert.equal(merged.Piano[0].articulation,'marcato_staccato');
  assert.equal(merged.Piano[0].gate,0.65);
  assert.equal(music.noteSoundingDuration(merged.Piano[0]),note.duration*0.65);
  assert.match(io.exportMusicXml(edited,merged),/<accent\/>/);
 });
 test('invalid note gates and articulations are rejected before saving',()=>{
  const p=music.blankProject({sections:1,measuresPerSection:1});
  const s=music.generate(p),n=music.suggestedEditorNote(p,'Piano',0,0,60);
  for(const gate of [0,-0.1,1.1,Infinity,NaN])assert.throws(()=>music.replaceInstrumentMeasure(p,s,'Piano',0,[{...n,gate}]),/gate/);
  assert.throws(()=>music.replaceInstrumentMeasure(p,s,'Piano',0,[{...n,articulation:'invalid'}]),/articulation/);
 });
 test('editor offers all-instrument articulation, gate and audition controls',()=>{
  const app=fs.readFileSync(path.join(root,'src/App.vue'),'utf8');
  assert.match(app,/New note articulation<select v-model="newNoteArticulation"/);
  assert.match(app,/<label>Articulation<select :value="selectedEvent.articulation/);
  assert.match(app,/Sounding length \(%\)/);
  assert.match(app,/noteSoundingDuration\(n\)/);
  assert.match(app,/noteSoundingVelocity\(n\)/);
  assert.match(app,/auditionEvent\(added\)/);
 });

console.log(`${passes} regression checks passed`);

// v1.8: Chromatic notes must be editable regardless of the chord or part role.
test('chromatic notes outside harmony can be entered and survive regeneration',()=>{
  const p=music.blankProject({sections:1,measuresPerSection:1});
  p.sectionKeys.A='Dm';p.bars[0].chord='Dm';p.roles.A['Violin I']='melody';
  assert.equal(music.noteEditorPitchClass(p,'Violin I',0,0,66),'chromatic'); // F# outside Dm and D natural minor
  const n=music.suggestedEditorNote(p,'Violin I',0,1,66,0.5);
  const edited=music.replaceInstrumentMeasure(p,music.generate(p),'Violin I',0,[n]);
  assert.equal(edited.generatedScore['Violin I'][0].pitch,66);
  assert.equal(music.mergeScores(edited,music.generate(edited))['Violin I'][0].pitch,66);
  const xml=io.exportMusicXml(edited,music.mergeScores(edited,music.generate(edited)));
  assert.deepEqual(Array.from(io.validateMusicXmlDurations(xml,4)),[]);
  assert.match(xml,/<step>G<\/step><alter>-1<\/alter>/); // Gb is enharmonic F# in a flat key
});
test('bass and chord roles also accept chromatic passing notes',()=>{
  const p=music.blankProject({sections:1,measuresPerSection:1});p.bars[0].chord='D';p.sectionKeys.A='D';
  for(const inst of ['Contrabass','Piano']){
    const pitch=inst==='Contrabass'?41:65; // F natural is outside D major chord
    assert.equal(music.noteEditorPitchClass(p,inst,0,0,pitch),'chromatic');
    const note=music.suggestedEditorNote(p,inst,0,0,pitch);
    assert.equal(note.pitch,pitch);
    const edited=music.replaceInstrumentMeasure(p,music.generate(p),inst,0,[note]);
    assert.equal(edited.generatedScore[inst][0].pitch,pitch);
  }
});
test('sharp and flat labels denote identical sounding pitches',()=>{
  assert.equal(music.editorPitchName(63,'sharp'),'D#4');
  assert.equal(music.editorPitchName(63,'flat'),'Eb4');
  assert.equal(music.parsePitch('Eb4'),music.parsePitch('D#4'));
  assert.equal(music.editorPitchName(70,'flat'),'Bb4');
  assert.throws(()=>music.editorPitchName(128,'flat'),/Invalid MIDI pitch/);
});
test('note editor never disables a piano-roll cell based on chord or key',()=>{
  const src=fs.readFileSync(path.join(root,'src/App.vue'),'utf8');
  assert.doesNotMatch(src,/pitchAllowed|noteFilter|:disabled="!pitchAllowed/);
  assert.match(src,/@click="noteCellClick\(pitch,beat\)"/);
  assert.match(src,/note-tone-\$\{pitchClass\(pitch,beat\)\}/);
  assert.match(src,/v-model="editorAccidentals"/);
  assert.match(src,/\{\{displayPitch\(pitch\)\}\}/);
});
