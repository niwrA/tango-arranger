const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');const cp=require('node:child_process');
let ts;try{ts=require('typescript')}catch{ts=require(path.join(cp.execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim(),'typescript'));}
const root=path.resolve(__dirname,'..');
function load(file,imports={}){
 const code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const mod={exports:{}};
 vm.runInNewContext(`(function(require,module,exports){${code}\n})`,{console})((name)=>{
  if(imports[name])return imports[name];if(name==='jszip')return class JSZip{};if(name==='@tonejs/midi')return {Midi:class Midi{}};throw Error('Unknown import '+name);
 },mod,mod.exports);
 return mod.exports;
}
const music=load('src/music.ts'),io=load('src/io.ts',{'./tempoExpressions':load('src/tempoExpressions.ts'),./music':music});
let checks=0;function test(label,fn){fn();checks++;console.log('PASS',label);}
const p=music.blankProject({sections:1,measuresPerSection:1,beats:4});
p.bars[0].chord='Dm';p.roles.A['Violin I']='melody';
test('all articulation choices keep one-beat written default',()=>{
 for(const art of ['staccato','marcato_staccato','legato'])assert.equal(music.newNoteWrittenDuration(p,'Violin I',0,0,art),1);
});
test('new-note default respects measure-end cap and explicit written lengths',()=>{
 assert.equal(music.newNoteWrittenDuration(p,'Violin I',0,3.75,'staccato'),0.25);
 assert.equal(music.suggestedEditorNote(p,'Violin I',0,0,72,0.25).duration,0.25);
});
test('sounding gates do not alter the written quarter-note length',()=>{
 const st={pitch:72,start:0,duration:1,articulation:'staccato',gate:0.125};
 const ma={pitch:74,start:1,duration:1,articulation:'marcato_staccato',gate:0.25,accent:true};
 assert.equal(music.noteSoundingDuration(st),0.125);
 assert.equal(music.noteSoundingDuration(ma),0.25);
 assert.equal(st.duration,1);assert.equal(ma.duration,1);
});
function pianoMeasure(xml){const part=xml.match(/<part id="P1">([\s\S]*?)<\/part>/)?.[1];assert.ok(part);return part;}
const notes=[
 {pitch:60,start:0,duration:1,articulation:'staccato',gate:0.125},
 {pitch:62,start:1,duration:1,articulation:'marcato_staccato',gate:0.25,accent:true},
 {pitch:64,start:2,duration:1,articulation:'staccato',accent:true,gate:0.125},
 {pitch:65,start:3,duration:1,articulation:'legato',gate:0.94},
];
function scoreWith(notes){const s=music.generate(p);s.Piano=notes;return s;}
test('MusicXML writes quarter note with dot for unaccented staccato',()=>{
 const xml=pianoMeasure(io.exportMusicXml(p,scoreWith(notes)));
 assert.match(xml,/<duration>480<\/duration>[\s\S]*?<type>quarter<\/type>[\s\S]*?<staccato\/>/);
 assert.equal((xml.match(/<staccato\/>/g)||[]).length,1);
});
test('MusicXML uses > accent for marcato and accented staccato',()=>{
 const xml=pianoMeasure(io.exportMusicXml(p,scoreWith(notes)));
 assert.equal((xml.match(/<accent\/>/g)||[]).length,2);
 assert.doesNotMatch(xml,/<strong-accent/);
 assert.deepEqual(Array.from(io.validateMusicXmlDurations(io.exportMusicXml(p,scoreWith(notes)),4)),[]);
});
test('MusicXML is independent of the sounding gate',()=>{
 const first=io.exportMusicXml(p,scoreWith(notes));
 const changed=notes.map(n=>({...n,gate:0.9}));
 assert.equal(first,io.exportMusicXml(p,scoreWith(changed)));
});
test('an explicitly entered sixteenth remains a sixteenth in MusicXML',()=>{
 const xml=pianoMeasure(io.exportMusicXml(p,scoreWith([{pitch:60,start:0,duration:0.25,articulation:'staccato'}])));
 assert.match(xml,/<duration>120<\/duration><voice>1<\/voice><type>16th<\/type>/);
});
test('generated tango violin staccato retains quarter notation despite very short playback',()=>{
 const q=music.blankProject({sections:1,measuresPerSection:1,beats:4});
 q.bars[0].chord='Dm';q.roles.A['Violin I']='chords';q.orchestration.violin.A={'Violin I':'tango_staccato'};
 q.instrumentSettings['Violin I'].activity=1;
 const generated=music.generate(q)['Violin I'];
 assert.ok(generated.some(n=>n.articulation==='staccato'&&n.gate<=0.22));
 assert.ok(generated.every(n=>n.duration===1));
 const xml=io.exportMusicXml(q,music.generate(q));
 const violin=xml.match(/<part id="P3">([\s\S]*?)<\/part>/)?.[1];assert.ok(violin);
 assert.match(violin,/<type>quarter<\/type>/);
 assert.match(violin,/<staccato\/>/);
 assert.match(violin,/<accent\/>/);
 assert.doesNotMatch(violin,/<strong-accent/);
});
console.log(`${checks} notation and playback separation checks passed`);
