const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module');
const root=path.resolve(__dirname,'..'),fromRepo=createRequire(path.join(root,'package.json')),ts=fromRepo('typescript');
globalThis.DOMParser=fromRepo('@xmldom/xmldom').DOMParser;
function loader(){
 const cache=new Map();
 function load(file){
  const full=path.resolve(root,file);
  if(cache.has(full))return cache.get(full).exports;
  const mod={exports:{}};cache.set(full,mod);
  const compiled=ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  vm.runInThisContext('(function(require,module,exports){'+compiled+'\n})',{filename:full})((name)=>{
   if(name.startsWith('.')){
    const base=path.resolve(path.dirname(full),name);
    const candidate=[base,base+'.ts',base+'.js',base+'.json'].find(fs.existsSync);
    if(!candidate)throw Error('Unknown relative import '+name);
    if(candidate.endsWith('.json'))return JSON.parse(fs.readFileSync(candidate,'utf8'));
    return load(candidate);
   }
   return fromRepo(name);
  },mod,mod.exports);
  return mod.exports;
 }
 return load;
}
const load=loader(),xml=load('src/musicXmlImport.ts'),music=load('src/music.ts'),merge=load('src/musicXmlMerge.ts');
const editions=load('src/editions.ts'),io=load('src/io.ts');
let count=0;
function check(name,fn){fn();count++;console.log('PASS',name);}
function xmlExample(){
 const parts=Array.from({length:4},(_,i)=>{
  const attrs=i===0?'<attributes><divisions>2</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves><key><fifths>4</fifths></key></attributes>':
   i===2?'<attributes><key><fifths>1</fifths></key></attributes>':'';
  const backup='<backup><duration>8</duration></backup>';
  return '<measure number="'+(i+1)+'">'+attrs+
   '<note><pitch><step>B</step><octave>3</octave></pitch><duration>2</duration><voice>1</voice><staff>1</staff></note>'+
   '<note><chord/><pitch><step>D</step><alter>1</alter><octave>4</octave></pitch><duration>2</duration><voice>1</voice><staff>1</staff></note>'+
   '<note><pitch><step>F</step><alter>1</alter><octave>4</octave></pitch><duration>6</duration><voice>1</voice><staff>1</staff></note>'+
   backup+
   '<note><pitch><step>B</step><octave>2</octave></pitch><duration>8</duration><voice>2</voice><staff>2</staff></note>'+
   '</measure>';
 }).join('');
 return '<?xml version="1.0" encoding="UTF-8"?><score-partwise version="3.1">'+
 '<work><work-title>Synthetic score</work-title></work><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>'+
 '<part id="P1">'+parts+'</part></score-partwise>';
}
function exampleData(){
 const old=music.blankProject({title:'Two-key test',sections:2,measuresPerSection:[8,16],beats:4,bpm:112});
 const intro=['D','G','B7','Em','C','G','D','G'];
 const other=['Em','Em','G','G','Am','Am','Em','Em','F#dim7','B7','Em','Em','A#dim','A#dim','B7','B7'];
 old.bars.forEach((bar,i)=>{bar.chord=i<8?intro[i]:other[i-8];});
 const notes=[],measures=[],chords=[];
 const emit=(chord,measure,sourceKey)=>{
  const root=chord.match(/^([A-G][#b]?)/)?.[0]||'C';
  const semitone=music.parsePitch(root+'4')%12;
  const rootPitch=36+semitone;
  const pcs=music.chordTones(chord);
  for(const [j,pc] of pcs.entries())notes.push({pitch:pc+60,start:measure*4+j*.25,duration:.75,source:'imported'});
  notes.push({pitch:rootPitch,start:measure*4,duration:2,source:'imported'});
  measures.push({number:measure+1,offset:measure*4,beats:4,beatType:4,keyFifths:sourceKey,mode:null,keyChanged:false,chords:[]});
  chords.push(chord);
 };
 const first=['B7','E','G#7','C#m','A','E','B7','E'];
 for(let m=0;m<32;m++)emit(m<16?first[m%8]:other[m-16],m,m<16?4:1);
 return {old,parsed:{title:'Synthetic two-key piano',parts:[{id:'P1',name:'Piano',notes,staffCount:2,measureCount:32,pitchedMeasures:32}],
  chords,keys:Array.from({length:32},(_,i)=>i<16?'E':'G'),measures,measureCount:32,warnings:[]}};
}
check('divisions persist across multiple measures and voices after backup',()=>{
 const parsed=xml.parseMusicXmlDetailed(xmlExample());
 assert.equal(parsed.measureCount,4);
 assert.equal(parsed.parts[0].notes.length,16);
 assert.deepEqual(parsed.parts[0].notes.map(n=>n.start).slice(0,4),[0,0,1,0]);
 assert.deepEqual(parsed.parts[0].notes.map(n=>n.start).slice(4,8),[4,4,5,4]);
 assert.equal(parsed.parts[0].notes[3].duration,4);
 assert.equal(parsed.parts[0].notes[3].xmlStaff,2);
 assert.equal(parsed.parts[0].notes[3].xmlVoice,'2');
 assert.equal(parsed.measures[2].keyFifths,1);
 assert.equal(parsed.keys[1],'E');
 assert.equal(parsed.keys[2],'G');
 assert.equal(parsed.parts[0].staffCount,2);
 assert.equal(parsed.warnings.length,0);
});
check('legacy import API uses corrected parser and does not invent harmony',()=>{
 const result=io.importMusicXml(xmlExample());
 assert.equal(result.parts[0].notes[4].start,4);
 assert.deepEqual(result.chords,['','','','']);
});
check('propose A intro +3, and later B section untransposed',()=>{
 const {old,parsed}=exampleData();
 const plan=merge.createMergePlan(old,parsed,'Piano',0,'fit','Synthetic.xml');
 assert.equal(plan.rows.length,24);
 assert.equal(plan.rows[0].theirs,0);
 assert.equal(plan.rows[0].shift,3);
 assert.equal(plan.rows[8].theirs,16);
 assert.equal(plan.rows[8].shift,0);
 assert.ok(plan.rows[8].confidence>=.7);
});
check('fit mode retains original form until selected measures use imported notes',()=>{
 let {old,parsed}=exampleData();
 old.generatedScore=music.generate(old);
 const before=JSON.stringify(old);
 let plan=merge.createMergePlan(old,parsed,'Piano',0,'fit','fixture.musicxml');
 plan=merge.modifyAlignment(plan,0,{notes:'theirs'});
 const staged=merge.previewMerge(old,parsed,plan);
 assert.equal(staged.proposed.bars.length,24);
 assert.ok(staged.proposed.generatedScore.Piano.some(n=>n.start===0&&n.pitch!==undefined));
 assert.equal(JSON.stringify(old),before);
 const applied=merge.applyReviewedMerge(old,parsed,plan);
 assert.ok(applied.importMergeBackup);
 assert.equal(applied.bars.length,24);
 assert.deepEqual(merge.undoReviewedMerge(applied).bars,old.bars);
 assert.equal(merge.undoReviewedMerge(applied).generatedScore.Piano.length,old.generatedScore.Piano.length);
});
check('protected measure is retained by default and can be manually edited in preview',()=>{
 const {old,parsed}=exampleData();
 const baseline=music.generate(old);
 let project=music.replaceInstrumentMeasure(old,baseline,'Piano',0,[{pitch:70,start:0,duration:1,source:'manual'}]);
 let plan=merge.createMergePlan(project,parsed,'Piano',0,'fit','fixture');
 assert.equal(plan.rows[0].notes,'ours');
 let preview=merge.previewMerge(project,parsed,plan);
 assert.ok(preview.proposed.generatedScore.Piano.some(n=>n.pitch===70&&n.start===0));
 const next={pitch:71,start:0,duration:1};
 plan=merge.modifyAlignment(plan,0,{notesOverride:[next],notes:'ours'});
 preview=merge.previewMerge(project,parsed,plan);
 assert.ok(preview.proposed.generatedScore.Piano.some(n=>n.pitch===71&&n.start===0));
 assert.ok(project.protectedBars['Piano:0']);
 assert.ok(!project.importMergeBackup);
});
check('leading piano can reshape measures and source key-signature regions',()=>{
 const {old,parsed}=exampleData();
 const plan=merge.createMergePlan(old,parsed,'Piano',0,'lead','fixture');
 const preview=merge.previewMerge(old,parsed,plan);
 assert.equal(preview.proposed.bars.length,32);
 assert.equal(preview.proposed.bars[0].section,'A');
 assert.equal(preview.proposed.bars[16].section,'B');
 assert.equal(preview.proposed.sectionKeys.A,'E');
 assert.equal(preview.proposed.sectionKeys.B,'G');
 assert.ok(preview.proposed.generatedScore.Piano.some(n=>n.start>=4*31));
 const finished=merge.applyReviewedMerge(old,parsed,plan);
 assert.equal(merge.undoReviewedMerge(finished).bars.length,24);
});
check('reference-only mode stores a plan but makes no project changes',()=>{
 const {old,parsed}=exampleData();
 const plan=merge.createMergePlan(old,parsed,'Piano',0,'reference','fixture');
 const review=merge.previewMerge(old,parsed,plan);
 assert.equal(review.changes,0);
 assert.throws(()=>merge.applyReviewedMerge(old,parsed,plan),/Reference-only/);
});
check('invalid remapping, transposition and missing parts are refused',()=>{
 const {old,parsed}=exampleData();
 const plan=merge.createMergePlan(old,parsed,'Piano',0,'fit','fixture');
 assert.throws(()=>merge.modifyAlignment(plan,0,{shift:25}),/24/);
 assert.throws(()=>merge.createMergePlan(old,parsed,'Flute',0,'fit','fixture'),/ensemble/);
 const invalid=merge.modifyAlignment(plan,0,{theirs:500});
 assert.throws(()=>merge.previewMerge(old,parsed,invalid),/Invalid MusicXML measure/);
});
check('original project survives a JSON round-trip after merge',()=>{
 const {old,parsed}=exampleData();
 const applied=merge.applyReviewedMerge(old,parsed,merge.createMergePlan(old,parsed,'Piano',0,'fit','fixture'));
 const portable=JSON.parse(JSON.stringify(applied));
 assert.ok(portable.importMergeBackup.project.bars.length===24);
 assert.ok(portable.importMergeBackup.sourceName);
});
check('contextual edit wizard and bounded iPad orchestration buttons are present',()=>{
 const app=fs.readFileSync(path.join(root,'src/App.vue'),'utf8');
 const css=fs.readFileSync(path.join(root,'src/style.css'),'utf8');
 const mergeUi=fs.readFileSync(path.join(root,'src/MusicXmlMergeReview.vue'),'utf8');
 assert.ok(app.includes('MusicXmlMergeReview'));
 assert.ok(app.includes('applyMusicXmlMerge'));
 assert.ok(app.includes('Undo last MusicXML merge'));
 assert.ok(mergeUi.includes('Edit ours')&&mergeUi.includes('Use theirs'));
 assert.ok(app.includes('class="instrument-heading-layout"'));
 assert.ok(css.includes('.instrument-heading-layout'));
 assert.ok(css.includes('.app-modal.musicxml-merge-modal'));
});
console.log(count+' MusicXML import/merge tests passed');

check('sequential empty-part imports default to incoming notes and preserve previous parts and rests',()=>{
 const old=music.blankProject({measures:4,beats:4});
 const parsed=xml.parseMusicXmlDetailed(xmlExample());
 const piano=merge.applyReviewedMerge(old,parsed,merge.createMergePlan(old,parsed,'Piano',0,'fit','piano.xml'));
 const violinPlan=merge.createMergePlan(piano,parsed,'Violin II',0,'fit','Violin2.xml');
 assert.equal(violinPlan.rows[0].notes,'theirs');assert.equal(violinPlan.rows[0].shift,0);
 const next=merge.applyReviewedMerge(piano,parsed,violinPlan);
 assert.deepEqual(next.generatedScore.Piano,piano.generatedScore.Piano);
 assert.ok(next.generatedScore['Violin II'].length);
 assert.ok(next.partEditions.Piano);
});
check('missing accompaniment is additive and skips absent harmony',()=>{
 const old=music.blankProject({measures:2,beats:4});old.bars[0].chord='Dm,A7';
 const bass=[{pitch:38,start:0,duration:1,xmlStaff:2,source:'imported'},{pitch:45,start:4,duration:1,xmlStaff:2,source:'imported'}];
 old.generatedScore={Piano:bass};old.importedScore={Piano:bass};old.protectedBars={'Piano:0':true,'Piano:1':true};
 const result=merge.completeMissingAccompaniment(old,'Piano','four');
 assert.deepEqual(result.filled,[0]);assert.deepEqual(result.skipped,[1]);
 assert.deepEqual(result.project.generatedScore.Piano.filter(n=>n.xmlStaff===2),bass);
 assert.ok(result.project.generatedScore.Piano.some(n=>n.source==='generated'&&n.start===2&&n.pitch%12===1));
 assert.deepEqual(merge.completeMissingAccompaniment(result.project,'Piano','four').filled,[]);
});
check('slash noteheads are rhythmic instructions, not literal pitches',()=>{
 const parsed=xml.parseMusicXmlDetailed(xmlExample().replace('<duration>2</duration><voice>1</voice>','<duration>2</duration><notehead>slash</notehead><voice>1</voice>'));
 assert.equal(parsed.parts[0].slashAttacks.length,1);assert.equal(parsed.parts[0].notes.length,15);
});
