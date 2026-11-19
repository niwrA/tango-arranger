const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const cp=require('node:child_process');
let ts;try{ts=require('typescript')}catch{ts=require(path.join(cp.execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim(),'typescript'));}
const root=path.resolve(__dirname,'..');
class TestZip{
  constructor(){this.files={};}
  file(name,content){this.files[name]=content;return this;}
  async generateAsync(){return {files:this.files};}
}
function load(file,imports={}){
  const source=fs.readFileSync(path.join(root,file),'utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const mod={exports:{}};
  vm.runInNewContext('(function(require,module,exports){'+compiled+'\n})',{console,Blob,URL,setTimeout},{filename:file})(
    name=>{
      if(imports[name])return imports[name];
      if(name==='jszip')return {default:TestZip};
      if(name==='@tonejs/midi')return {Midi:class Midi{}};
      throw Error('Unexpected import '+name);
    },mod,mod.exports);
  return mod.exports;
}
const music=load('src/music.ts');
const io=load('src/io.ts',{'./music':music});
(async()=>{
  const p=music.blankProject({title:'Vals & <Tango>',bpm:108,beats:3,measures:4});
  const score=music.generate(p);
  const xml=io.exportMusicXml(p,score);
  assert.match(xml,/<work-title>Vals &amp; &lt;Tango&gt;<\/work-title>/);
  assert.match(xml,/<movement-title>Vals &amp; &lt;Tango&gt;<\/movement-title>/);
  assert.match(xml,/<credit page="1"><credit-type>title<\/credit-type><credit-words[^>]*>Vals &amp; &lt;Tango&gt;<\/credit-words><\/credit>/);
  assert.equal((xml.match(/<credit-type>title<\/credit-type>/g)||[]).length,1);
  assert.match(xml,/<per-minute>108<\/per-minute>/);
  assert.match(xml,/<sound tempo="108"\/>/);
  assert.deepEqual(Array.from(io.validateMusicXmlDurations(xml,3,music.projectInstruments(p).length)),[]);
  const mxl=await io.exportCompressedMusicXml(p,score);
  assert.equal(mxl.files['score.musicxml'],xml);
  assert.match(mxl.files['META-INF/container.xml'],/score\.musicxml/);
  const mscz=await io.exportMuseScoreMscz(p,score);
  const mscx=mscz.files['score.mscx'];
  assert.match(mscx,/<metaTag name="workTitle">Vals &amp; &lt;Tango&gt;<\/metaTag>/);
  assert.match(mscx,/<VBox><height>10<\/height><Text><style>Title<\/style><text>Vals &amp; &lt;Tango&gt;<\/text><\/Text><\/VBox>/);
  assert.equal((mscx.match(/<VBox>/g)||[]).length,1);
  assert.match(mscx,/<Tempo><tempo>1\.8<\/tempo><followText>1<\/followText><text><sym>metNoteQuarterUp<\/sym> = 108<\/text><\/Tempo>/);
  assert.equal((mscx.match(/<Tempo>/g)||[]).length,1);
  const part=await io.exportMuseScoreMscz(p,score,'Violin I');
  assert.equal((part.files['score.mscx'].match(/<VBox>/g)||[]).length,1);
  assert.equal((part.files['score.mscx'].match(/<Tempo>/g)||[]).length,1);
  const abc=io.exportAbc(p,score,'lead');
  assert.equal(abc.split('\n').find(line=>line.startsWith('T:')),'T:Vals & <Tango>');
  assert.match(abc,/\nT:Lead Sheet\n/);
  assert.match(abc,/\nQ:1\/4=108\n/);
  const partAbc=io.exportAbc(p,score,'Violin I');
  assert.equal(partAbc.split('\n').find(line=>line.startsWith('T:')),'T:Vals & <Tango>');
  assert.match(partAbc,/\nQ:1\/4=108\n/);
  const bundle=await io.exportMobileSheetsBundle(p,score);
  assert.match(bundle.files['00-lead-sheet.abc'],/\nQ:1\/4=108\n/);
  assert.match(bundle.files['README.txt'],/Song: Vals & <Tango>\nTempo: 108 quarter notes per minute/);
  const untitled=music.blankProject({title:'',bpm:92,beats:4,measures:2});
  assert.match(io.exportMusicXml(untitled,music.generate(untitled)),/<work-title>Untitled Tango<\/work-title>/);
  console.log('PASS score title and BPM in visible MusicXML, MXL, native MSCZ, part MSCZ, ABC and MobileSheets bundle');
})().catch(error=>{console.error(error);process.exitCode=1;});
