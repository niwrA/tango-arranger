const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');const cp=require('node:child_process');
let ts;try{ts=require('typescript')}catch{ts=require(path.join(cp.execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim(),'typescript'));}
function load(file,imports={}){const compiled=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;const mod={exports:{}};vm.runInNewContext(`(function(require,module,exports){${compiled}\n})`,{console,localStorage:{getItem:()=>null,setItem:()=>{}},Blob,URL},{filename:file})((name)=>{if(imports[name])return imports[name];if(name==='@tonejs/midi')return {Midi:class Midi{}};if(name==='jszip')return class JSZip{};throw Error('Missing dependency '+name);},mod,mod.exports);return mod.exports;}
const music=load('src/music.ts');const io=load('src/io.ts',{'./tempoExpressions':load('src/tempoExpressions.ts'),'./music':music});
let p=music.demoProject();assert.equal(music.projectInstruments(p).length,7);
p=music.setProjectRoster(p,[...music.FACTORY_INSTRUMENTS,'Violin III','Violin IV','Voice II']);
assert.equal(music.projectInstruments(p).length,10);
assert.equal(p.roles.A1['Voice II'],'harmony');
p.roles.A1.Voice='melody';p.instrumentSettings.Voice={activity:1};p.instrumentSettings['Voice II']={activity:1};
const score=music.generate(p);assert.equal(Object.keys(score).length,10);
const first=score.Voice.filter(n=>n.start<32);const second=score['Voice II'].filter(n=>n.start<32);
assert.ok(first.length>0&&second.length>0,'Both voices must sing');
assert.equal(first.length,second.length,'Harmony follows melody rhythm');
for(let i=0;i<first.length;i++){assert.equal(first[i].start,second[i].start);assert.equal(first[i].duration,second[i].duration);}
const xml=io.exportMusicXml(p,score);assert.ok(xml.includes('<part-name>Voice II</part-name>'));assert.ok(xml.includes('<part-name>Violin IV</part-name>'));
assert.deepEqual(Array.from(io.validateMusicXmlDurations(xml,p.beats,10)),[]);
const edited=music.replaceInstrumentMeasure(p,score,'Voice II',0,[{pitch:60,start:0,duration:1}]);const merged=music.mergeScores(edited,music.generate(edited));assert.equal(merged['Voice II'][0].pitch,60);
console.log('PASS dynamic 10-part roster, two-voice harmony, protected edits, MusicXML');
