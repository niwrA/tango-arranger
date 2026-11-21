const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),cp=require('node:child_process');
let ts;try{ts=require('typescript')}catch{ts=require(path.join(cp.execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim(),'typescript'));}
const root=path.resolve(__dirname,'..');
class FakeZip{constructor(){this.files={};}file(name,contents){this.files[name]=contents;return this;}async generateAsync(){return {files:this.files};}}
function load(name,imports={}){
 const source=fs.readFileSync(path.join(root,name),'utf8');
 const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const mod={exports:{}};
 const env={console,Blob,URL,setTimeout,TextDecoder,TextEncoder};
 vm.runInNewContext('(function(require,module,exports){'+code+'\n})',env,{filename:name})((request)=>{
  if(imports[request])return imports[request];
  if(request==='jszip')return {default:FakeZip};
  if(request==='@tonejs/midi')return {Midi:class Midi{}};
  throw Error('Unknown dependency '+request);
 },mod,mod.exports);
 return mod.exports;
}
const gestures=load('src/tangoGestures.ts');
const phrases=load('src/phrasePlan.ts');
const music=load('src/music.ts',{'./tangoGestures':gestures,'./phrasePlan':phrases});
const editions=load('src/editions.ts',{'./music':music,'./phrasePlan':phrases});
const io=load('src/io.ts',{'./tempoExpressions':load('src/tempoExpressions.ts'),./music':music,'./editions':editions,'./tangoGestures':gestures,'./musicXmlImport':{parseMusicXmlDetailed(){throw Error('Not used in export tests');}}});
let checks=0;
function check(label,task){task();checks++;console.log('PASS',label);}
function song(){
 const p=music.blankProject({sections:1,measuresPerSection:3,beats:4,bpm:118,title:'Ediciones & Tango'});
 p.bars.forEach((bar,i)=>{bar.chord=i===1?'A7':'Dm';bar.melody=[{pitch:74,start:0,duration:1},{pitch:76,start:1,duration:1},{pitch:77,start:2,duration:2}];});
 p.instrumentSettings.Piano={...(p.instrumentSettings.Piano??{}),difficulty:'advanced'};
 p.instrumentSettings['Violin I']={...(p.instrumentSettings['Violin I']??{}),difficulty:'intermediate'};
 p.generatedScore=music.generate(p);
 return p;
}
check('legacy version-1 project migrates lazily without modifying schema',()=>{
 const p=song();delete p.partEditions;
 const updated=editions.switchInstrumentEdition(p,'Piano','easy');
 assert.equal(updated.version,1);assert.equal(p.partEditions,undefined);
 assert.equal(editions.currentEditionLevel(updated,'Piano'),'easy');
 assert.ok(updated.partEditions.Piano.advanced);assert.ok(updated.partEditions.Piano.easy);
 assert.equal(editions.currentEditionLevel(updated,'Violin I'),'intermediate');
});
check('each difficulty retains its own protected hand edits through repeated switching',()=>{
 let p=song();
 p=editions.switchInstrumentEdition(p,'Piano','easy');
 p=music.replaceInstrumentMeasure(p,editions.assembleEditionScore(p),'Piano',0,[{pitch:72,start:0,duration:1}]);
 p=editions.switchInstrumentEdition(p,'Piano','advanced');
 p=music.replaceInstrumentMeasure(p,editions.assembleEditionScore(p),'Piano',0,[{pitch:76,start:0,duration:1}]);
 p=editions.switchInstrumentEdition(p,'Piano','easy');
 const easy=editions.assembleEditionScore(p).Piano.filter(n=>n.start<4);
 assert.equal(easy.length,1);assert.equal(easy[0].pitch,72);
 assert.equal(p.protectedBars['Piano:0'],true);
 p=editions.switchInstrumentEdition(p,'Piano','advanced');
 const advanced=editions.assembleEditionScore(p).Piano.filter(n=>n.start<4);
 assert.equal(advanced.length,1);assert.equal(advanced[0].pitch,76);
 assert.ok(p.partEditions.Piano.easy);
});
check('switching one player does not alter any other player or protection',()=>{
 let p=song();
 p=music.replaceInstrumentMeasure(p,editions.assembleEditionScore(p),'Violin I',1,[{pitch:72,start:4,duration:1}]);
 const before=JSON.stringify(editions.assembleEditionScore(p)['Violin I']);
 p=editions.switchInstrumentEdition(p,'Piano','easy');
 assert.equal(JSON.stringify(editions.assembleEditionScore(p)['Violin I']),before);
 assert.ok(p.protectedBars['Violin I:1']);
});
check('score assembly supports mixed-skill players and is non-destructive',()=>{
 const p=song(),before=JSON.stringify(p);
 const score=editions.assembleEditionScore(p,{Piano:'easy','Violin I':'advanced'});
 assert.ok(score.Piano.length);assert.ok(score['Violin I'].length);
 assert.equal(JSON.stringify(p),before);
 const xml=io.exportMusicXml(p,score,{editionLevels:{Piano:'easy','Violin I':'advanced'}});
 assert.match(xml,/Piano · easy/);
 assert.match(xml,/Violin I · advanced/);
 assert.equal(io.validateMusicXmlDurations(xml,4,music.projectInstruments(p).length).length,0);
});
check('stored alternatives and protected edits survive a JSON file round trip',()=>{
 let p=song();p=editions.switchInstrumentEdition(p,'Piano','easy');
 p=music.replaceInstrumentMeasure(p,editions.assembleEditionScore(p),'Piano',0,[{pitch:72,start:0,duration:1}]);
 const saved=editions.snapshotActiveEditions(p);
 const copy=JSON.parse(JSON.stringify(saved));
 const again=editions.switchInstrumentEdition(copy,'Piano','advanced');
 assert.equal(again.partEditions.Piano.easy.protectedMeasures[0],0);
 assert.equal(again.partEditions.Piano.easy.notes.find(n=>n.start===0).pitch,72);
});
check('regenerating one level preserves protected notes and other stored editions',()=>{
 let p=song();
 p=editions.switchInstrumentEdition(p,'Piano','easy');
 p=music.replaceInstrumentMeasure(p,editions.assembleEditionScore(p),'Piano',0,[{pitch:72,start:0,duration:1}]);
 const oldEasy=JSON.stringify(p.partEditions.Piano.advanced);
 p=editions.regenerateInstrumentEdition(p,'Piano','easy');
 assert.equal(editions.assembleEditionScore(p).Piano.filter(n=>n.start<4)[0].pitch,72);
 assert.ok(p.protectedBars['Piano:0']);
 assert.equal(JSON.stringify(p.partEditions.Piano.advanced),oldEasy);
});
check('song changes mark stored editions as stale, without deleting edits',()=>{
 let p=song();p=editions.switchInstrumentEdition(p,'Piano','easy');p=editions.switchInstrumentEdition(p,'Piano','advanced');
 p.bars[0].chord='G7';
 const state=editions.getEditionInfo(p,'Piano','easy');
 assert.equal(state.stored,true);assert.equal(state.stale,true);
 assert.equal(editions.EDITION_LEVELS.length,3);
});
check('generating an uncreated version does not reuse protected notes from other levels',()=>{
 let p=song();p=music.replaceInstrumentMeasure(p,editions.assembleEditionScore(p),'Violin I',0,[{pitch:83,start:0,duration:1}]);
 const easy=editions.assembleEditionScore(p,{'Violin I':'easy'})['Violin I'].filter(n=>n.start<4);
 assert.ok(!easy.some(n=>n.pitch===83&&n.source==='manual'));
});
(async()=>{
 const p=song();
 const blob=await io.exportEditionPrintPack(p),files=blob.files,roster=music.projectInstruments(p);
 assert.ok(files['selected-ensemble.musicxml']);
 for(const inst of roster)for(const level of editions.EDITION_LEVELS){
  const file='parts/'+inst.toLowerCase().replace(/[^a-z0-9-]+/g,'-')+'/'+level+'.musicxml';
  assert.ok(files[file],file);
  assert.equal(io.validateMusicXmlDurations(files[file],4,1).length,0,file);
 }
 const selection=JSON.parse(files['edition-selections.json']);
 assert.equal(selection.selection.length,roster.length);
 assert.equal(selection.title,p.title);
 assert.ok(selection.selection.every(entry=>Array.isArray(entry.stale)));
 const one=files['parts/piano/easy.musicxml'];
 assert.match(one,/<part-name>Piano · easy<\/part-name>/);
 assert.ok(!one.includes('<part id="P2">'));
 assert.match(files['README.txt'],/Open selected-ensemble.musicxml in MuseScore/);
 const app=fs.readFileSync(path.join(root,'src/App.vue'),'utf8');
 assert.ok(app.includes('orchestration-editions-bar'));
 assert.ok(app.includes('switchDifficultyEdition'));
 assert.ok(app.includes('exportDifficultyEditionPack'));
 const local=fs.readFileSync(path.join(root,'src/localProjects.ts'),'utf8');
 assert.ok(local.includes('snapshotActiveEditions(project)'));
 console.log('PASS print bundle, selectable difficulty UI and local persistence');
 console.log((checks+1)+' edition checks passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
