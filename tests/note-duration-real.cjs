const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const cp=require('node:child_process');
let ts;try{ts=require('typescript')}catch{ts=require(path.join(cp.execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim(),'typescript'));}
const root=path.resolve(__dirname,'..');
function load(file,imports={}){
  const source=fs.readFileSync(path.join(root,file),'utf8');
  const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const mod={exports:{}};
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`,{console,Blob,URL,setTimeout},{filename:file})((name)=>{
    if(imports[name])return imports[name];
    if(name==='jszip')return class JSZip{};
    if(name==='@tonejs/midi')return {Midi:class Midi{}};
    throw Error('Unexpected import '+name);
  },mod,mod.exports);
  return mod.exports;
}
const edit=load('src/noteEditing.ts');
const music=load('src/music.ts');
const io=load('src/io.ts',{'./music':music});
let passes=0;
function test(name,fn){fn();passes++;console.log('PASS',name)}
test('dragging right by two grid cells lengthens note by 0.5 beats',()=>assert.equal(edit.dragWrittenDuration(1,88,44,0.25,0,4),1.5));
test('dragging left shortens note by two grid cells',()=>assert.equal(edit.dragWrittenDuration(1,-88,44,0.25,0,4),0.5));
test('dragging note end cannot exceed measure',()=>assert.equal(edit.dragWrittenDuration(1,1000,44,0.25,2.5,4),1.5));
test('duration clamp respects non-grid note onset',()=>assert.equal(edit.clampWrittenDuration(1.125,5,4),2.875));
test('duration clamp respects minimum',()=>assert.equal(edit.clampWrittenDuration(0,-2,4),0.25));
test('duration math rejects invalid geometry',()=>assert.throws(()=>edit.dragWrittenDuration(1,44,0,0.25,0,4)));
test('duration edit persists in generated and protected imported scores',()=>{
  const p=music.demoProject();p.bars=p.bars.slice(0,2);
  const score=music.generate(p);
  const inst='Contrabass',b=0;
  const notes=score[inst].filter(n=>n.start<4).map(n=>({...n}));
  const first=notes[0];assert.ok(first,'expected contrabass note');
  first.duration=edit.clampWrittenDuration(first.start,1.5,p.beats);
  const updated=music.replaceInstrumentMeasure(p,score,inst,b,notes);
  const saved=updated.generatedScore[inst].find(n=>n.start===first.start&&n.pitch===first.pitch);
  assert.equal(saved.duration,first.duration);
  assert.equal(updated.importedScore[inst].find(n=>n.start===first.start&&n.pitch===first.pitch).duration,first.duration);
  assert.equal(updated.protectedBars['Contrabass:0'],true);
  const xml=io.exportMusicXml(updated,updated.generatedScore);
  assert.deepEqual(Array.from(io.validateMusicXmlDurations(xml,4)),[]);
  assert.equal(music.mergeScores(updated,music.generate(updated))[inst].find(n=>n.start===first.start&&n.pitch===first.pitch).duration,first.duration);
});
test('note bars render across measure with width proportional to real duration, including off-grid starts',()=>{
  const app=fs.readFileSync('src/App.vue','utf8');
  const css=fs.readFileSync('src/style.css','utf8');
  assert.match(app,/left:`\$\{\(n\.start-selectedBar\*project\.beats\)\/project\.beats\*100\}%`/);
  assert.match(app,/width:`\$\{n\.duration\/project\.beats\*100\}%`/);
  assert.match(app,/class="note-lane-grid"/);
  assert.match(css,/\.note-bar\{position:absolute/);
  assert.match(css,/\.note-bar \.note-resize-handle/);
});
test('pointer capture is on stable scroller and duration updates on input',()=>{
  const app=fs.readFileSync('src/App.vue','utf8');
  assert.match(app,/scroller\.setPointerCapture\(event\.pointerId\)/);
  assert.match(app,/@pointermove="moveNoteDrag\(\$event\)"/);
  assert.match(app,/function applyWrittenDurationDraft\(/);
  assert.match(app,/@change="applyWrittenDurationDraft"/);
  assert.match(app,/@click="applyWrittenDurationDraft"/);
  assert.match(app,/@input="updateSelectedNote\('duration'/);
  assert.match(app,/:max="selectedDurationMax"/);
  assert.match(app,/if\(field==='duration'\)message\.value/);
});
console.log(`${passes} real duration regression checks passed`);
