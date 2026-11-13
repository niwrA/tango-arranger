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
  const p=music.blankProject();assert.equal(p.bars.length,32);assert.equal(p.beats,4);
  assert.ok(p.bars.every(b=>b.chord===''&&b.melody.length===0));
  assert.equal(p.bars[8].section,'B1');assert.equal(p.bars[16].section,'A2');
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
  assert.throws(()=>music.blankProject({measures:0}),/measures/);
  assert.throws(()=>music.blankProject({beats:5}),/Choose/);
  assert.throws(()=>music.blankProject({bpm:999}),/Tempo/);
});

console.log(`${passes} regression checks passed`);
