const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');const cp=require('node:child_process');
let ts;try{ts=require('typescript')}catch{ts=require(path.join(cp.execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim(),'typescript'));}
const root=path.resolve(__dirname,'..');
function load(file,imports={}){
 const code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const mod={exports:{}};
 vm.runInNewContext(`(function(require,module,exports){${code}\n})`,{console})((name)=>{if(imports[name])return imports[name];if(name==='jszip')return class JSZip{};if(name==='@tonejs/midi')return {Midi:class Midi{}};throw Error('Unexpected import '+name);},mod,mod.exports);
 return mod.exports;
}
const music=load('src/music.ts'),io=load('src/io.ts',{'./music':music});
const app=fs.readFileSync(path.join(root,'src/App.vue'),'utf8');
let count=0;function test(name,fn){fn();count++;console.log('PASS',name);}
function project(beats=4){const p=music.blankProject({sections:1,measuresPerSection:2,beats});p.bars[0].chord='Dm';p.roles.A['Violin I']='melody';p.roles.A['Violin II']='chords';p.roles.A['Contrabass']='bass';return p;}
test('staccato keeps a quarter-note written default',()=>{const p=project();assert.equal(music.newNoteWrittenDuration(p,'Violin I',0,0,'staccato'),1);});
test('marcato keeps a quarter-note written default',()=>{const p=project();assert.equal(music.newNoteWrittenDuration(p,'Violin I',0,0,'marcato_staccato'),1);});
test('legato explicitly sets a quarter-note written default',()=>{const p=project();assert.equal(music.newNoteWrittenDuration(p,'Violin I',0,0,'legato'),1);});
test('measure-level staccato is inherited',()=>{const p=project();p.articulation.overrides={'Violin I:0':'staccato'};assert.equal(music.newNoteWrittenDuration(p,'Violin I',0,0),1);});
test('measure-level marcato is inherited',()=>{const p=project();p.articulation.overrides={'Violin I:0':'marcato_staccato'};assert.equal(music.newNoteWrittenDuration(p,'Violin I',0,0),1);});
test('measure override also controls violin chord accents',()=>{const p=project();p.orchestration.violin.A={'Violin II':'tango_staccato'};p.articulation.overrides={'Violin II:0':'staccato'};assert.equal(music.newNoteWrittenDuration(p,'Violin II',0,0),1);const n=music.suggestedEditorNote(p,'Violin II',0,0,69,1);assert.equal(n.articulation,'staccato');assert.equal(n.gate,undefined);});
test('explicit note articulation overrides measure style',()=>{const p=project();p.articulation.overrides={'Violin I:0':'staccato'};assert.equal(music.newNoteWrittenDuration(p,'Violin I',0,0,'marcato_staccato'),1);});
test('violin chord marcato and staccato share written lengths',()=>{const p=project();p.orchestration.violin.A={'Violin II':'tango_staccato'};assert.equal(music.newNoteWrittenDuration(p,'Violin II',0,0),1);assert.equal(music.newNoteWrittenDuration(p,'Violin II',0,1),1);});
test('bass marcato style influences new-note duration',()=>{const p=project();p.orchestration.contrabass.A='marcato';assert.equal(music.newNoteWrittenDuration(p,'Contrabass',0,0),1);});
test('bass legato style influences new-note duration',()=>{const p=project();p.orchestration.contrabass.A='arco_legato';assert.equal(music.newNoteWrittenDuration(p,'Contrabass',0,0),1);});
test('new note length is capped at the end of measure',()=>{const p=project();assert.equal(music.newNoteWrittenDuration(p,'Violin I',0,3.75,'legato'),0.25);});
test('invalid onset is rejected',()=>{const p=project();assert.throws(()=>music.newNoteWrittenDuration(p,'Violin I',0,4),/outside measure/);});
test('explicit duration still wins when inserted',()=>{const p=project();const n=music.suggestedEditorNote(p,'Violin I',0,0,74,2);assert.equal(n.duration,2);});
test('newly inserted marcato note persists with correct written duration and XML',()=>{const p=project();const duration=music.newNoteWrittenDuration(p,'Violin I',0,1,'marcato_staccato');const note={...music.suggestedEditorNote(p,'Violin I',0,1,74,duration),articulation:'marcato_staccato',accent:true};const next=music.replaceInstrumentMeasure(p,music.generate(p),'Violin I',0,[note]);assert.equal(next.generatedScore['Violin I'].find(n=>n.pitch===74&&n.start===1).duration,1);assert.deepEqual(Array.from(io.validateMusicXmlDurations(io.exportMusicXml(next,next.generatedScore),4)),[]);});
test('inserting a note does not alter existing notes',()=>{const p=project();const original={pitch:74,start:0,duration:2};const added=music.suggestedEditorNote(p,'Violin I',0,2,76,music.newNoteWrittenDuration(p,'Violin I',0,2,'staccato'));const next=music.replaceInstrumentMeasure(p,music.generate(p),'Violin I',0,[original,added]);assert.equal(next.generatedScore['Violin I'].find(n=>n.pitch===74).duration,2);assert.equal(next.generatedScore['Violin I'].find(n=>n.pitch===76).duration,1);});
test('UI defaults to Auto and computes written length before inserting',()=>{assert.match(app,/const noteLength=ref<number\|'auto'>\('auto'\)/);assert.match(app,/noteLength\.value='auto'/);assert.match(app,/<option value="auto">Auto \(written rhythm\)<\/option>/);assert.match(app,/newNoteWrittenDuration\(project\.value,noteInst\.value,selectedBar\.value,beat,newNoteArticulation\.value\)/);});
test('UI retains manual duration override',()=>{assert.match(app,/:Math\.min\(noteLength\.value,project\.value\.beats-beat\)/);assert.match(app,/:value="d"/);});
console.log(`${count} articulation-aware note entry checks passed`);
