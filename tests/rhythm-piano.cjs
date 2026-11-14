const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const cp=require('node:child_process');
let ts;try{ts=require('typescript')}catch{ts=require(path.join(cp.execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim(),'typescript'));}
const root=path.resolve(__dirname,'..');
function load(file,imports={}){
 const src=fs.readFileSync(path.join(root,file),'utf8');
 const code=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const mod={exports:{}};
 vm.runInNewContext(`(function(require,module,exports){${code}\n})`,{console,Blob,URL,setTimeout},{filename:file})((name)=>{
   if(name in imports)return imports[name];
   if(name==='jszip')return class JSZip{};
   if(name==='@tonejs/midi')return {Midi:class Midi{}};
   throw Error('Unexpected import '+name);
 },mod,mod.exports);
 return mod.exports;
}
const music=load('src/music.ts');const io=load('src/io.ts',{'./music':music});
let count=0;function test(label,fn){fn();count++;console.log('PASS',label);}
const p=music.blankProject({sections:1,measuresPerSection:4});p.bars.forEach(b=>b.chord='Dm,A7');
p.roles.A.Piano='chords';p.roles.A.Contrabass='bass';p.roles.A['Bandoneon I']='chords';p.roles.A['Bandoneon II']='chords';
p.orchestration.bandoneon.A={'Bandoneon I':{target:'independent',method:'exact'},'Bandoneon II':{target:'independent',method:'exact'}};
p.instrumentSettings.Piano.activity=1;p.instrumentSettings.Contrabass.activity=1;
const score=music.generate(p);
test('UI version is read from package version',()=>{
 const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
 assert.equal(pkg.version,'3.1.0');
 const app=fs.readFileSync(path.join(root,'src/App.vue'),'utf8');
 assert.match(app,/import \{version as appVersion\} from '\.\.\/package\.json'/);
 assert.match(app,/v\{\{appVersion\}\}/);
 assert.doesNotMatch(app,/prototype 2\.0/);
 assert.match(app,/synth\?\.triggerAttackRelease\(Tone\.Frequency\(event\.pitch,'midi'\)\.toFrequency\(\)/);
});
test('piano generated lower staff is monophonic and within bass range',()=>{
 const lower=score.Piano.filter(n=>n.pitch<(p.pianoSplitPitch??60));
 assert.ok(lower.length>=2);
 const positions=new Set();for(const n of lower){assert.ok(n.pitch<=55);assert.ok(!positions.has(n.start),`bass chord at ${n.start}`);positions.add(n.start);}
});
test('piano generated upper inversions stay in treble range',()=>{
 const upper=score.Piano.filter(n=>n.pitch>=(p.pianoSplitPitch??60));
 assert.ok(upper.length>=8);assert.ok(new Set(upper.map(n=>n.pitch)).size>=3);
});
test('custom piano split respected by figure generation',()=>{
 const other=music.blankProject({sections:1,measuresPerSection:1});other.bars[0].chord='Dm';other.pianoSplitPitch=65;
 const notes=music.figureMeasure(other,'Piano',0,'chords_up');
 assert.ok(notes.filter(n=>n.pitch>=65).length>=8);
 assert.ok(notes.filter(n=>n.pitch<65).every(n=>n.pitch<=55));
});
test('piano, contrabass and bandoneon notes use notated beat grid',()=>{
 for(const inst of ['Piano','Contrabass','Bandoneon I','Bandoneon II']){
  const notes=score[inst];assert.ok(notes.length,inst);
  for(const n of notes){assert.equal(n.start*4,Math.round(n.start*4),`${inst} onset ${n.start}`);assert.equal(n.duration*4,Math.round(n.duration*4),`${inst} duration ${n.duration}`);}
 }
});
test('short bass and bandoneon articulation stored as sounding gate',()=>{
 for(const inst of ['Contrabass','Bandoneon I','Bandoneon II']){
  assert.ok(score[inst].some(n=>n.gate!==undefined&&n.gate<0.8),`${inst} has no short gate`);
  assert.ok(score[inst].every(n=>n.duration>=0.5),`${inst} has excessively short written duration`);
 }
});
test('piano figure keeps detached gate and full written duration',()=>{
 const n=score.Piano.find(n=>n.pitch>=60);
 assert.ok(n&&n.gate&&n.gate<1);
 assert.equal(n.duration,1);
 assert.ok(music.noteSoundingDuration(n)<n.duration);
});
test('MusicXML piano staff voices and notation remain valid',()=>{
 const xml=io.exportMusicXml(p,score);
 assert.deepEqual(Array.from(io.validateMusicXmlDurations(xml,4)),[]);
 const part=xml.match(/<part id="P1">([\s\S]*?)<\/part>/)[1];
 assert.match(part,/<staves>2<\/staves>/);assert.match(part,/<clef number="1"><sign>G<\/sign>/);assert.match(part,/<clef number="2"><sign>F<\/sign>/);
 assert.match(part,/<voice>1<\/voice>/);assert.match(part,/<voice>2<\/voice>/);
 for(const id of [1,2,5,6]){
  const block=xml.match(new RegExp(`<part id="P${id}">([\\s\\S]*?)<\\/part>`))[1];
  assert.doesNotMatch(block,/<type>64th<\/type>|<type>32nd<\/type>/,`part ${id} contains artificial micro-rests`);
 }
});
test('manual imported note lengths remain unchanged',()=>{
 const manual={pitch:64,start:0.25,duration:0.75,source:'manual'};
 const updated=music.replaceInstrumentMeasure(p,score,'Piano',0,[manual]);
 assert.equal(updated.importedScore.Piano[0].duration,0.75);
});
console.log(`${count} rhythm/piano checks passed`);
