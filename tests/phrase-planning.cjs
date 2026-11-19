const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module'),root=path.resolve(__dirname,'..'),actualRequire=createRequire(path.join(root,'package.json'));
const ts=actualRequire('typescript');
function loader(){
 const cache=new Map();
 function load(filename){
  const absolute=path.resolve(root,filename);
  if(cache.has(absolute))return cache.get(absolute).exports;
  const mod={exports:{}};cache.set(absolute,mod);
  const source=fs.readFileSync(absolute,'utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  function requireFrom(request){
   if(request.startsWith('.')){
    const base=path.resolve(path.dirname(absolute),request);
    const match=[base,base+'.ts',base+'.js',base+'.json'].find(x=>fs.existsSync(x));
    if(!match)throw Error('Cannot load '+request+' from '+filename);
    return load(match);
   }
   if(request==='jszip')return {default:actualRequire('jszip')};
   return actualRequire(request);
  }
  vm.runInThisContext('(function(require,module,exports){'+compiled+'\n})',{filename:absolute})(requireFrom,mod,mod.exports);
  return mod.exports;
 }
 return load;
}
const load=loader(),music=load('src/music.ts'),plan=load('src/phrasePlan.ts'),
 editions=load('src/editions.ts'),io=load('src/io.ts');
let passed=0;
function check(name,fn){fn();passed++;console.log('PASS',name);}
function sample(){
 const p=music.blankProject({title:'Phrase study',sections:2,measuresPerSection:[5,3],bpm:122});
 p.bars.forEach((bar,i)=>{bar.chord=i%2?'A7':'Dm';bar.melody=[{pitch:74,start:0,duration:1},{pitch:76,start:1,duration:1},{pitch:77,start:2,duration:2}];});
 p.instrumentSettings.Piano={...(p.instrumentSettings.Piano||{}),activity:1,difficulty:'advanced'};
 return p;
}
function barNotes(score,inst,b,beats=4){return score[inst].filter(n=>n.start>=b*beats&&n.start<(b+1)*beats);}
check('legacy generation remains exactly the same without an applied phrase plan',()=>{
 const p=sample(),before=JSON.stringify(music.generate(p));
 assert.equal(plan.phraseAt(p,0),undefined);
 assert.equal(JSON.stringify(music.generate({...p,phrasePlan:undefined})),before);
});
check('suggestions cover each song section with contiguous deterministic ranges',()=>{
 const p=sample(),a=plan.createPhrasePlan(p,2),b=plan.createPhrasePlan(p,2);
 assert.equal(a.phrases.length,5);
 assert.deepEqual(a.phrases.map(x=>[x.startMeasure,x.endMeasure]),[[0,1],[2,3],[4,4],[5,6],[7,7]]);
 assert.equal(JSON.stringify(a),JSON.stringify(b));
 assert.deepEqual(Array.from(plan.validatePhrasePlan(p,a)),[]);
});
check('invalid, overlapping, stale or incomplete drafts cannot be applied',()=>{
 const p=sample(),proposed=plan.createPhrasePlan(p,2);
 const bad=JSON.parse(JSON.stringify(proposed));bad.phrases[1].startMeasure=1;
 assert.ok(plan.validatePhrasePlan(p,bad).length);
 assert.throws(()=>editions.applyPhrasePlan(p,bad));
 assert.equal(p.phrasePlan,undefined);
 const removed=JSON.parse(JSON.stringify(proposed));delete removed.phrases[0].parts.Piano;
 assert.ok(plan.validatePhrasePlan(p,removed).length);
 const changed={...p,instruments:['Piano','Violin I']};
 assert.ok(plan.validatePhrasePlan(changed,proposed).length);
});
check('phrase placement gives intentional rests and preserves explicit measure roles',()=>{
 let p=sample();const proposal=plan.createPhrasePlan(p,4);
 const part=proposal.phrases[0].parts.Piano;
 part.activity=.5;part.placement='closing';
 p={...p,phrasePlan:proposal};
 assert.equal(plan.plannedMeasureActive(p,'Piano',0),false);
 assert.equal(plan.plannedMeasureActive(p,'Piano',1),false);
 assert.equal(plan.plannedMeasureActive(p,'Piano',2),true);
 assert.equal(plan.plannedMeasureActive(p,'Piano',3),true);
 p.measureRoles={'Piano:0':'chords','Piano:3':'rest'};
 assert.equal(plan.plannedMeasureActive(p,'Piano',0),true);
 assert.equal(plan.effectiveRole(p,'Piano',3),'rest');
});
check('role plans and phrase rests affect emitted notes without inventing blank harmony',()=>{
 let p=sample(),proposed=plan.createPhrasePlan(p,2);
 proposed.phrases[0].parts.Piano.activity=0;
 proposed.phrases[0].parts['Violin II'].role='rest';
 p={...p,phrasePlan:proposed};
 const score=music.generate(p);
 assert.equal(barNotes(score,'Piano',0).length,0);
 assert.equal(barNotes(score,'Violin II',0).length,0);
 assert.ok(barNotes(score,'Piano',2).length);
 p.bars[2]={...p.bars[2],chord:'',melody:[]};
 assert.equal(barNotes(music.generate(p),'Piano',2).length,0);
});
check('phrase-level violin and bass techniques reach generation and note editor',()=>{
 let p=sample(),proposed=plan.createPhrasePlan(p,2);
 proposed.phrases[0].parts['Violin II'].violinTechnique='pizzicato';
 proposed.phrases[0].parts['Violin II'].role='chords';
 proposed.phrases[0].parts.Contrabass.bassTechnique='walking';
 proposed.phrases[0].parts['Violin II'].articulation='legato';
 p={...p,phrasePlan:proposed};
 assert.equal(music.noteEditorContext(p,'Violin II',0).technique,'pizzicato');
 assert.equal(music.noteEditorContext(p,'Violin II',0).articulation,'legato');
 assert.equal(music.noteEditorContext(p,'Contrabass',0).technique,'walking');
 const violin=barNotes(music.generate(p),'Violin II',0);
 assert.ok(violin.length);
 assert.ok(violin.every(n=>n.articulation==='legato'));
 assert.ok(violin.every(n=>n.gate===undefined));
});
check('explicit per-measure settings override the surrounding phrase',()=>{
 let p=sample(),proposed=plan.createPhrasePlan(p,2);
 proposed.phrases[0].parts['Violin II'].role='rest';
 proposed.phrases[0].parts['Violin II'].violinTechnique='arpeggio';
 proposed.phrases[0].parts['Violin II'].articulation='staccato';
 p={...p,phrasePlan:proposed,measureRoles:{'Violin II:0':'chords'},measureViolinTechniques:{'Violin II:0':'pizzicato'}};
 p.articulation.overrides['Violin II:0']='legato';
 assert.equal(plan.effectiveRole(p,'Violin II',0),'chords');
 assert.equal(plan.effectiveViolinTechnique(p,'Violin II',0),'pizzicato');
 assert.equal(music.noteEditorContext(p,'Violin II',0).articulation,'legato');
});
check('protected lyric and gesture material survives applying and removing a plan',()=>{
 let p=sample(),base=music.generate(p);
 const n={pitch:72,start:0,duration:2,lyric:'tan',source:'manual',articulation:'legato'};
 p=music.replaceInstrumentMeasure(p,base,'Violin I',0,[n]);
 const proposed=plan.createPhrasePlan(p,2);
 proposed.phrases[0].parts['Violin I'].role='rest';
 p=editions.applyPhrasePlan(p,proposed);
 assert.equal(barNotes(editions.assembleEditionScore(p),'Violin I',0)[0].lyric,'tan');
 assert.equal(p.protectedBars['Violin I:0'],true);
 p=editions.applyPhrasePlan(p,undefined);
 assert.equal(p.phrasePlan,undefined);
 assert.equal(barNotes(editions.assembleEditionScore(p),'Violin I',0)[0].pitch,72);
});
check('applied planning retains stale alternatives and independently edited difficulty versions',()=>{
 let p=sample();p=editions.switchInstrumentEdition(p,'Piano','easy');
 p=music.replaceInstrumentMeasure(p,editions.assembleEditionScore(p),'Piano',0,[{pitch:72,start:0,duration:1}]);
 p=editions.switchInstrumentEdition(p,'Piano','advanced');
 const oldEasy=JSON.stringify(p.partEditions.Piano.easy.notes);
 p=editions.applyPhrasePlan(p,plan.createPhrasePlan(p,2));
 assert.equal(JSON.stringify(p.partEditions.Piano.easy.notes),oldEasy);
 assert.equal(editions.getEditionInfo(p,'Piano','easy').stale,true);
 assert.ok(p.partEditions.Piano.advanced);
});
check('changing form, meter and roster makes a saved plan inactive',()=>{
 let p=sample();const proposal=plan.createPhrasePlan(p,2);p={...p,phrasePlan:proposal};
 assert.ok(plan.phrasePlanIsCurrent(p,proposal));
 assert.equal(plan.phraseAt({...p,beats:3},0),undefined);
 assert.equal(plan.phraseAt({...p,instruments:['Piano']},0),undefined);
 const changed={...p,bars:p.bars.slice(0,-1)};
 assert.equal(plan.phraseMeasureMap(changed).some(Boolean),false);
});
check('plan survives JSON serialization without changing editable notes',()=>{
 const p=sample(),applied=editions.applyPhrasePlan(p,plan.createPhrasePlan(p,2));
 const restored=JSON.parse(JSON.stringify(editions.snapshotActiveEditions(applied)));
 assert.deepEqual(Array.from(plan.validatePhrasePlan(restored,restored.phrasePlan)),[]);
 assert.ok(restored.partEditions.Piano.advanced);
});
check('the Orchestration user interface exposes draft, preview and apply controls',()=>{
 const ui=fs.readFileSync(path.join(root,'src/PhrasePlanEditor.vue'),'utf8');
 const app=fs.readFileSync(path.join(root,'src/App.vue'),'utf8');
 assert.match(ui,/Create proposal/);assert.match(ui,/Apply phrase plan/);
 assert.match(ui,/Active measures/);assert.match(ui,/Discard draft/);
 assert.match(app,/<PhrasePlanEditor :project="project"/);
 assert.match(app,/function applyReviewedPhrasePlan/);
});
(async()=>{
 const p=sample();const applied=editions.applyPhrasePlan(p,plan.createPhrasePlan(p,2));
 const xml=io.exportMusicXml(applied,editions.assembleEditionScore(applied));
 assert.deepEqual(Array.from(io.validateMusicXmlDurations(xml,p.beats,music.projectInstruments(p).length)),[]);
 const blob=await io.exportEditionPrintPack(applied);const buffer=Buffer.from(await blob.arrayBuffer());
 assert.ok(buffer.length>400);
 const JSZip=actualRequire('jszip');const zip=await JSZip.loadAsync(buffer);
 assert.ok(zip.file('selected-ensemble.musicxml'));
 assert.ok(zip.file('parts/violin-i/advanced.musicxml'));
 const saved=zip.file('selected-ensemble.musicxml');
 assert.ok((await saved.async('string')).includes('<score-partwise'));
 console.log('PASS MuseScore MusicXML and printable mixed-skill edition ZIP');
 console.log((passed+1)+' phrase planning tests passed');
})().catch(err=>{console.error(err);process.exitCode=1;});
