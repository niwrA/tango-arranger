const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const JSZip=require('jszip');
const {createDomainLoader}=require('./load-domain.cjs');

// Exercise the actual JSON download with only the browser shell replaced.
const downloads=[];
let pendingDownload;
const load=createDomainLoader({globals:{
 URL:{createObjectURL(blob){pendingDownload={blob};return 'blob:phrase-test';},revokeObjectURL(){}},
 document:{body:{appendChild(){}},createElement(){return {click(){downloads.push({...pendingDownload,filename:this.download});},remove(){}};}},
 window:{setTimeout(callback){callback();return 0;}}
}});
const music=load('src/music.ts');
const planning=load('src/phrasePlan.ts');
const editions=load('src/editions.ts');
const gestures=load('src/tangoGestures.ts');
const io=load('src/io.ts');
const clone=value=>JSON.parse(JSON.stringify(value));
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'
 ?Object.fromEntries(Object.keys(value).sort().filter(key=>value[key]!==undefined).map(key=>[key,canonical(value[key])])):value;
const fingerprint=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const measureNotes=(score,inst,measure,beats=4)=>(score[inst]??[]).filter(note=>note.start>=measure*beats-1e-7&&note.start<(measure+1)*beats-1e-7);
const activeMeasures=(p,score,inst)=>p.bars.flatMap((_,measure)=>measureNotes(score,inst,measure,p.beats).length?[measure]:[]);
function song(lengths=[8],roster){
 let p=music.blankProject({sections:lengths.length,measuresPerSection:lengths,title:'Frases & Tango',beats:4,bpm:120});
 if(roster)p=music.setProjectRoster(p,roster);
 for(const [i,bar] of p.bars.entries()){
  bar.chord=i%4===3?'A7':'Dm';
  bar.melody=[{pitch:74,start:0,duration:1},{pitch:77,start:1,duration:1},{pitch:76,start:2,duration:2}];
 }
 for(const section of Object.keys(p.roles))for(const inst of music.projectInstruments(p)){
  p.roles[section][inst]=inst.startsWith('Contrabass')?'bass':inst==='Violin II'||inst==='Voice II'?'harmony':inst==='Violin I'||inst.startsWith('Voice')?'melody':'chords';
 }
 for(const inst of music.projectInstruments(p))p.instrumentSettings[inst]={difficulty:'advanced',activity:1};
 return p;
}
function planned(p,phraseBars=8){return {...p,phrasePlan:planning.createPhrasePlan(p,phraseBars)};}
function editPart(plan,index,inst,changes){Object.assign(plan.phrases[index].parts[inst],changes);return plan;}
let checks=0;
async function check(label,task){await task();checks++;console.log('PASS',label);}

(async()=>{
 await check('legacy songs without a phrase plan retain their exact generated notes',()=>{
  // Deterministic fingerprint updated for piano left-hand compas following
  // contrabass roots/fifths in the A0-C8 instrument model. Musical changes to
  // generated piano bass notes are intentional; phrase planner must not alter
  // the newly generated score when no phrase plan is applied.
  assert.equal(fingerprint(music.generate(music.demoProject())),
   '65d7e737af64658cde8c792ff0c933c77b9b242eea5870170528b2e6e5eddea2');
  const p=song([3]);assert.equal(planning.phraseAt(p,0),undefined);
  assert.equal(planning.effectiveRole(p,'Violin I',0),'melody');
  assert.deepEqual(music.generate({...p,phrasePlan:undefined}),music.generate(p));
 });

 await check('suggested phrases are deterministic, cover unequal sections and retain short tails',()=>{
  const p=song([10,3,9]),before=JSON.stringify(p),plan=planning.createPhrasePlan(p,4);
  assert.deepEqual(plan.phrases.map(phrase=>[phrase.section,phrase.startMeasure,phrase.endMeasure]),
   [['A',0,3],['A',4,7],['A',8,9],['B',10,12],['C',13,16],['C',17,20],['C',21,21]]);
  assert.deepEqual(planning.validatePhrasePlan(p,plan),[]);
  assert.equal(planning.phrasePlanIsCurrent(p,plan),true);
  assert.deepEqual(planning.createPhrasePlan(p,4),plan);
  assert.equal(JSON.stringify(p),before);
  for(const invalid of [0,-1,1.5,33,NaN])assert.throws(()=>planning.createPhrasePlan(p,invalid));
  const applied={...p,phrasePlan:plan};
  assert.equal(planning.phraseAt(applied,10).section,'B');
  assert.equal(planning.phraseAt(applied,21).endMeasure,21);
  for(const outside of [-1,22,0.5,NaN])assert.equal(planning.phraseAt(applied,outside),undefined);
 });

 await check('malformed, overlapping, gapped, cross-section and wrong-roster plans are rejected atomically',()=>{
  const p=song([6,3]),valid=planning.createPhrasePlan(p,4),before=JSON.stringify(p);
  const mutations=[
   plan=>{plan.version=2;},
   plan=>{plan.phraseBars=0;},
   plan=>{plan.phrases[0].endMeasure=99;},
   plan=>{plan.phrases[0].startMeasure=-1;},
   plan=>{plan.phrases[1].startMeasure=3;},
   plan=>{plan.phrases[1].startMeasure=5;},
   plan=>{plan.phrases[0].endMeasure=6;plan.phrases[1].startMeasure=7;},
   plan=>{plan.phrases[1].id=plan.phrases[0].id;},
   plan=>{plan.phrases[1].section='Wrong';},
   plan=>{plan.phrases.pop();},
   plan=>{delete plan.phrases[0].parts.Piano;},
   plan=>{plan.phrases[0].parts['Flute III']={role:'melody',activity:1,placement:'opening'};},
   plan=>{plan.phrases[0].parts.Piano.role='unknown';},
   plan=>{plan.phrases[0].parts.Piano.activity=1.01;},
   plan=>{plan.phrases[0].parts.Piano.activity=NaN;},
   plan=>{plan.phrases[0].parts.Piano.placement='random';},
   plan=>{plan.phrases[0].parts.Piano.articulation='auto';},
   plan=>{plan.phrases[0].parts.Piano.violinTechnique='pizzicato';},
   plan=>{plan.phrases[0].parts['Violin I'].bassTechnique='walking';},
   plan=>{plan.phrases[0].parts=null;},
   plan=>{plan.phrases[0]=null;},
   plan=>{plan.phrases={};}
  ];
  for(const mutate of mutations){
   const invalid=clone(valid);mutate(invalid);
   assert.ok(planning.validatePhrasePlan(p,invalid).length>0);
   assert.equal(planning.phrasePlanIsCurrent(p,invalid),false);
   assert.throws(()=>editions.applyPhrasePlan(p,invalid));
   assert.equal(JSON.stringify(p),before,'Invalid application mutated the input');
  }
  for(const invalid of [null,undefined,[],{},42]){
   assert.ok(planning.validatePhrasePlan(p,invalid).length>0);
  }
 });

 await check('phrase activity uses coherent opening and closing groups with explicit active-measure counts',()=>{
  const source=song([8]);source.instrumentSettings['Bandoneon II'].activity=.5;
  const before=JSON.stringify(source),p=planned(source);
  editPart(p.phrasePlan,0,'Bandoneon II',{activity:.5,placement:'closing'});
  assert.deepEqual(activeMeasures(p,music.generate(p),'Bandoneon II'),[4,5,6,7]);
  assert.notDeepEqual(activeMeasures(source,music.generate(source),'Bandoneon II'),[4,5,6,7]);
  editPart(p.phrasePlan,0,'Bandoneon II',{placement:'opening'});
  assert.deepEqual(activeMeasures(p,music.generate(p),'Bandoneon II'),[0,1,2,3]);
  editPart(p.phrasePlan,0,'Bandoneon II',{placement:'throughout'});
  const throughout=activeMeasures(p,music.generate(p),'Bandoneon II');
  assert.equal(throughout.length,4);assert.equal(throughout[0],0);assert.equal(throughout.at(-1),7);
  assert.ok(throughout.slice(1).every((measure,i)=>measure>throughout[i]+1));
  editPart(p.phrasePlan,0,'Bandoneon II',{activity:0});
  assert.deepEqual(activeMeasures(p,music.generate(p),'Bandoneon II'),[]);
  editPart(p.phrasePlan,0,'Bandoneon II',{activity:1});
  assert.deepEqual(activeMeasures(p,music.generate(p),'Bandoneon II'),[0,1,2,3,4,5,6,7]);
  assert.equal(JSON.stringify(source),before);
 });

 await check('measure roles override phrase settings and deliberate rests remain silent',()=>{
  const p=planned(song([4]));
  editPart(p.phrasePlan,0,'Bandoneon II',{role:'rest',activity:0});
  p.measureRoles={'Bandoneon II:1':'chords','Piano:2':'rest'};
  assert.equal(planning.effectiveRole(p,'Bandoneon II',0),'rest');
  assert.equal(planning.effectiveRole(p,'Bandoneon II',1),'chords');
  assert.deepEqual(activeMeasures(p,music.generate(p),'Bandoneon II'),[1]);
  assert.equal(measureNotes(music.generate(p),'Piano',2).length,0);
  assert.equal(music.noteEditorContext(p,'Bandoneon II',1).role,'chords');
  assert.equal(music.noteEditorContext(p,'Bandoneon II',0).role,'rest');
  const noOverride=clone(p);delete noOverride.measureRoles;
  assert.deepEqual(activeMeasures(noOverride,music.generate(noOverride),'Bandoneon II'),[]);
 });

 await check('a phrase plan never invents harmony or notes in blank source measures',()=>{
  let p=music.blankProject({sections:1,measuresPerSection:4});p=planned(p,2);
  for(const phrase of p.phrasePlan.phrases)for(const part of Object.values(phrase.parts)){part.activity=1;part.role='chords';}
  assert.equal(music.scoreStats(music.generate(p)),0);
  editPart(p.phrasePlan,0,'Violin I',{role:'melody'});
  p.bars[0].melody=[{pitch:74,start:1,duration:1}];
  const score=music.generate(p);
  assert.ok(score['Violin I'].length>0);
  for(const inst of music.projectInstruments(p).filter(inst=>inst!=='Violin I'))assert.equal(score[inst].length,0,inst);
 });

 await check('phrase technique and articulation reach generated notes and editor context, with measure precedence',()=>{
  const p=planned(song([4]));
  editPart(p.phrasePlan,0,'Violin II',{role:'chords',violinTechnique:'pizzicato',articulation:'staccato'});
  editPart(p.phrasePlan,0,'Violin I',{role:'melody',articulation:'legato'});
  editPart(p.phrasePlan,0,'Contrabass',{bassTechnique:'arco_legato'});
  editPart(p.phrasePlan,0,'Piano',{articulation:'staccato'});
  p.measureViolinTechniques={'Violin II:1':'sustained'};
  p.measureBassTechniques={'Contrabass:1':'pizzicato'};
  p.articulation.overrides={'Violin I:1':'marcato_staccato'};
  const score=music.generate(p),violin=measureNotes(score,'Violin II',0);
  assert.ok(violin.length>0);assert.ok(violin.every(note=>note.technique==='pizzicato'));
  assert.ok(violin.every(note=>note.articulation==='staccato'));
  assert.ok(measureNotes(score,'Violin I',0).every(note=>note.articulation==='legato'));
  assert.ok(measureNotes(score,'Violin I',1).every(note=>note.articulation==='marcato_staccato'));
  assert.ok(measureNotes(score,'Violin II',1).every(note=>note.technique!=='pizzicato'));
  assert.ok(measureNotes(score,'Contrabass',0).every(note=>note.technique==='arco'));
  assert.ok(measureNotes(score,'Contrabass',1).every(note=>note.technique==='pizzicato'));
  assert.equal(music.noteEditorContext(p,'Violin II',0).technique,'pizzicato');
  assert.equal(music.noteEditorContext(p,'Violin II',1).technique,'sustained');
  assert.equal(music.noteEditorContext(p,'Contrabass',0).technique,'arco_legato');
  assert.equal(music.noteEditorContext(p,'Violin I',0).articulation,'legato');
  for(const note of measureNotes(score,'Piano',0)){
   assert.equal(note.articulation,'staccato');assert.equal(note.gate,undefined);
   assert.ok(Math.abs(music.noteSoundingDuration(note)/note.duration-music.ARTICULATION_GATES.staccato)<1e-8);
  }
  const manual=music.suggestedEditorNote(p,'Violin II',0,0,69,1);
  assert.equal(manual.articulation,'staccato');assert.equal(manual.gate,undefined);
  assert.equal(music.noteSoundingDuration(manual),music.ARTICULATION_GATES.staccato);
 });

 await check('planned violin harmony follows the actual lead, including a protected source line',()=>{
  let p=song([4]);p.roles.A['Violin I']='chords';p.roles.A['Violin II']='chords';
  p=music.replaceInstrumentMeasure(p,music.generate(p),'Violin I',0,[
   {pitch:79,start:.5,duration:.5},{pitch:77,start:2.25,duration:1.25}
  ]);
  p=planned(p);
  editPart(p.phrasePlan,0,'Violin I',{role:'melody'});
  editPart(p.phrasePlan,0,'Violin II',{role:'harmony'});
  const lead=measureNotes(editions.assembleEditionScore(p),'Violin I',0);
  const harmony=measureNotes(music.generate(p),'Violin II',0);
  assert.deepEqual(harmony.map(note=>[note.start,note.duration]),lead.map(note=>[note.start,note.duration]));
  assert.ok(harmony.every((note,i)=>note.pitch<lead[i].pitch));
  assert.equal(music.noteEditorContext(p,'Violin II',0).role,'harmony');
 });

 await check('a planned Bandoneon lead or variation takes precedence over section following',()=>{
  const legacy=song([2]);
  legacy.roles.A['Violin II']='chords';legacy.roles.A['Bandoneon I']='melody';
  legacy.orchestration.bandoneon.A={'Bandoneon I':{target:'Violin II',method:'exact'}};
  const oldScore=music.generate(legacy);
  const events=notes=>notes.map(note=>[note.pitch,note.start,note.duration]);
  assert.deepEqual(events(measureNotes(oldScore,'Bandoneon I',0)),events(measureNotes(oldScore,'Violin II',0)),
   'Legacy section following must remain unchanged without a reviewed plan');
  const p=planned(legacy,2);
  const score=music.generate(p);
  assert.deepEqual(events(measureNotes(score,'Bandoneon I',0)),events(p.bars[0].melody));
  assert.deepEqual(events(measureNotes(score,'Violin II',0)),events(measureNotes(oldScore,'Violin II',0)));
  editPart(p.phrasePlan,0,'Bandoneon I',{role:'variation'});
  const variation=measureNotes(music.generate(p),'Bandoneon I',0);
  assert.deepEqual(events(variation),[[74,0,.5],[72,.5,.5],[77,1,.5],[75,1.5,.5],[76,2,1],[74,3,1]]);
 });

 await check('planned violin harmony follows its lead when the roster lists Violin II first',()=>{
  const p=planned(song([3],['Violin II','Piano','Violin I']),3);
  const score=music.generate(p),lead=measureNotes(score,'Violin I',0),harmony=measureNotes(score,'Violin II',0);
  assert.ok(lead.length>0);assert.equal(harmony.length,lead.length);
  assert.deepEqual(harmony.map(note=>[note.start,note.duration]),lead.map(note=>[note.start,note.duration]));
  assert.ok(harmony.every((note,i)=>note.pitch<lead[i].pitch));
  assert.deepEqual(music.projectInstruments(p),['Violin II','Piano','Violin I']);
 });

 await check('planned legato controls audible gates and new-note defaults while measure overrides still win',()=>{
  const p=planned(song([2]),2);
  for(const inst of ['Piano','Contrabass','Violin II'])editPart(p.phrasePlan,0,inst,{articulation:'legato'});
  editPart(p.phrasePlan,0,'Violin II',{role:'chords',violinTechnique:'tango_staccato'});
  editPart(p.phrasePlan,0,'Contrabass',{bassTechnique:'traditional'});
  p.articulation.overrides={'Piano:1':'staccato','Contrabass:1':'marcato_staccato','Violin II:1':'staccato'};
  const score=music.generate(p);
  for(const inst of ['Piano','Contrabass']){
   const notes=measureNotes(score,inst,0);assert.ok(notes.length>0);
   for(const note of notes){
    assert.equal(note.articulation,'legato');assert.equal(note.gate,undefined);
    assert.ok(Math.abs(music.noteSoundingDuration(note)/note.duration-.94)<1e-8);
   }
  }
  for(const [inst,articulation] of [['Piano','staccato'],['Contrabass','marcato_staccato']]){
   const notes=measureNotes(score,inst,1);assert.ok(notes.length>0);
   for(const note of notes){
    assert.equal(note.articulation,articulation);
    assert.ok(Math.abs(music.noteSoundingDuration(note)/note.duration-music.ARTICULATION_GATES[articulation])<1e-8);
   }
  }
  const manual=music.suggestedEditorNote(p,'Violin II',0,0,69);
  assert.equal(manual.articulation,'legato');assert.equal(manual.duration,1);
  assert.equal(manual.gate,undefined);assert.equal(music.noteSoundingDuration(manual),.94);
  const override=music.suggestedEditorNote(p,'Violin II',1,0,69);
  assert.equal(override.articulation,'staccato');assert.equal(override.duration,.5);
  assert.equal(override.gate,undefined);
  assert.equal(music.suggestedEditorNote(p,'Violin II',0,0,69,.25).duration,.25);
 });

 await check('custom rosters use planned voice roles, linked harmony and consistent melody ducking',()=>{
  const roster=['Voice II','Piano','Violin III','Voice I','Clarinet','Contrabass'];
  const p=song([4],roster);
  for(const inst of roster)p.roles.A[inst]='chords';
  p.phrasePlan=planning.createPhrasePlan(p,4);
  editPart(p.phrasePlan,0,'Voice I',{role:'melody'});
  editPart(p.phrasePlan,0,'Voice II',{role:'harmony'});
  editPart(p.phrasePlan,0,'Contrabass',{role:'bass'});
  p.melodyDucking={enabled:true,reduction:30};
  assert.deepEqual(Object.keys(p.phrasePlan.phrases[0].parts),roster);
  assert.deepEqual(planning.validatePhrasePlan(p,p.phrasePlan),[]);
  const score=music.generate(p),lead=measureNotes(score,'Voice I',0),harmony=measureNotes(score,'Voice II',0);
  assert.ok(lead.length>0);assert.equal(harmony.length,lead.length);
  assert.deepEqual(harmony.map(note=>[note.start,note.duration]),lead.map(note=>[note.start,note.duration]));
  assert.equal(music.melodyDuckingFactor(p,'Piano',0),.7);
  assert.equal(music.melodyDuckingFactor(p,'Voice I',0),1);
  assert.equal(music.melodyDuckingFactor(p,'Contrabass',0),1);
  p.measureRoles={'Voice I:0':'rest'};
  assert.equal(music.melodyDuckingFactor(p,'Piano',0),1);
 });

 await check('applying, revising and removing the plan preserve exact protected gesture and lyric notes',()=>{
  let p=song([4,2]);p.generatedScore=music.generate(p);
  const violin={pitch:72,start:0,duration:2,gate:.43,velocity:71,articulation:'legato'};
  violin.gesture=gestures.createTangoGesture(violin,'Violin I','sirena_double_down_tremolo',music.instrumentRange('Violin I'));
  p=music.replaceInstrumentMeasure(p,p.generatedScore,'Violin I',0,[violin]);
  p=music.replaceInstrumentMeasure(p,p.generatedScore,'Voice',1,[
   {pitch:67,start:4,duration:2,gate:.81,lyric:'Sue',lyric2:'Tan',syllabic:'begin',syllabic2:'begin',melisma:true}
  ]);
  const original=JSON.stringify(p),notes=clone(p.generatedScore),plan=planning.createPhrasePlan(p,4);
  editPart(plan,0,'Violin I',{role:'rest'});editPart(plan,0,'Voice',{role:'rest'});
  let next=editions.applyPhrasePlan(p,plan);
  assert.equal(JSON.stringify(p),original);
  assert.deepEqual(measureNotes(next.generatedScore,'Violin I',0),measureNotes(notes,'Violin I',0));
  assert.deepEqual(measureNotes(next.generatedScore,'Voice',1),measureNotes(notes,'Voice',1));
  assert.equal(measureNotes(next.generatedScore,'Violin I',1).length,0);
  assert.equal(next.protectedBars['Violin I:0'],true);assert.equal(next.protectedBars['Voice:1'],true);
  const revised=clone(next.phrasePlan);editPart(revised,0,'Piano',{activity:.5,placement:'closing'});
  next=editions.applyPhrasePlan(next,revised);
  next=editions.applyPhrasePlan(next,undefined);
  assert.equal(next.phrasePlan,undefined);
  assert.deepEqual(measureNotes(next.generatedScore,'Violin I',0),measureNotes(notes,'Violin I',0));
  assert.deepEqual(measureNotes(next.generatedScore,'Voice',1),measureNotes(notes,'Voice',1));
  assert.ok(measureNotes(next.generatedScore,'Violin I',1).length>0);
 });

 await check('applying a shared plan refreshes active editions and preserves independently edited alternatives as stale',()=>{
  let p=song([4]);p.generatedScore=music.generate(p);
  p=editions.switchInstrumentEdition(p,'Piano','easy');
  p=music.replaceInstrumentMeasure(p,p.generatedScore,'Piano',0,[{pitch:60,start:0,duration:1,gate:.5}]);
  p=editions.switchInstrumentEdition(p,'Piano','advanced');
  p=music.replaceInstrumentMeasure(p,p.generatedScore,'Piano',0,[{pitch:72,start:0,duration:2,gate:.8}]);
  p=editions.snapshotActiveEditions(p);
  const oldEasy=clone(p.partEditions.Piano.easy),plan=planning.createPhrasePlan(p,4);
  editPart(plan,0,'Piano',{activity:.5,placement:'closing'});
  let next=editions.applyPhrasePlan(p,plan);
  assert.deepEqual(next.partEditions.Piano.easy,oldEasy);
  assert.equal(editions.getEditionInfo(next,'Piano','easy').stale,true);
  for(const inst of music.projectInstruments(next)){
   assert.equal(editions.getEditionInfo(next,inst,editions.currentEditionLevel(next,inst)).stale,false,inst);
  }
  assert.equal(measureNotes(next.generatedScore,'Piano',0)[0].pitch,72);
  assert.deepEqual(activeMeasures(next,next.generatedScore,'Piano'),[0,2,3]);
  next=editions.switchInstrumentEdition(next,'Piano','easy');
  assert.equal(measureNotes(next.generatedScore,'Piano',0)[0].pitch,60);
  next=editions.regenerateInstrumentEdition(next,'Piano','easy');
  assert.equal(measureNotes(next.generatedScore,'Piano',0)[0].pitch,60);
  assert.deepEqual(activeMeasures(next,next.generatedScore,'Piano'),[0,2,3]);
  assert.equal(editions.getEditionInfo(next,'Piano','easy').stale,false);
  next=editions.switchInstrumentEdition(next,'Piano','advanced');
  assert.equal(measureNotes(next.generatedScore,'Piano',0)[0].pitch,72);
 });

 await check('editing one phrase has no reference alias into another phrase or caller draft',()=>{
  const p=song([8]),plan=planning.createPhrasePlan(p,4),secondBefore=JSON.stringify(plan.phrases[1]);
  editPart(plan,0,'Bandoneon II',{role:'rest'});
  assert.equal(JSON.stringify(plan.phrases[1]),secondBefore);
  const next=editions.applyPhrasePlan(p,plan),before=JSON.stringify(next.phrasePlan);
  editPart(plan,0,'Bandoneon II',{role:'melody'});
  assert.equal(JSON.stringify(next.phrasePlan),before,'Applied plan retained a mutable caller draft');
  assert.equal(measureNotes(next.generatedScore,'Bandoneon II',0).length,0);
  assert.ok(measureNotes(next.generatedScore,'Bandoneon II',4).length>0);
 });

 await check('changed form, meter and roster invalidate old plan bounds without partial application',()=>{
  const p=planned(song([4,3]),4);
  editPart(p.phrasePlan,0,'Piano',{role:'rest'});
  const variants=[
   next=>{next.bars.pop();},
   next=>{next.bars[1].section='B';},
   next=>{next.beats=3;},
   next=>{next.instruments=['Piano','Contrabass'];}
  ];
  for(const mutate of variants){
   const changed=clone(p);mutate(changed);
   assert.equal(planning.phrasePlanIsCurrent(changed,changed.phrasePlan),false);
   assert.equal(planning.phraseAt(changed,0),undefined);
   assert.deepEqual(music.generate(changed),music.generate({...changed,phrasePlan:undefined}));
  }
  const resized=music.resizeSections(p,[5,3]);
  assert.equal(resized.phrasePlan,undefined);
  const twoFour=planned({...song([4]),beats:2},2);
  twoFour.bars.forEach(bar=>{bar.melody=[];});
  assert.equal(music.convertTwoFourToFour(twoFour).phrasePlan,undefined);
 });

 await check('shared melody, harmony and tempo edits retain valid bounds but make old note editions stale',()=>{
  let p=song([4]);p=editions.switchInstrumentEdition(p,'Piano','easy');
  p=editions.switchInstrumentEdition(p,'Piano','advanced');
  p=editions.applyPhrasePlan(p,planning.createPhrasePlan(p,4));
  const revised=clone(p);revised.bars[0].chord='Gm';revised.bars[1].melody[0].pitch=72;revised.bpm=132;
  assert.equal(planning.phrasePlanIsCurrent(revised,revised.phrasePlan),true);
  assert.equal(editions.getEditionInfo(revised,'Piano','advanced').stale,true);
  assert.deepEqual(revised.phrasePlan,p.phrasePlan);
 });

 await check('native JSON download and both JSON/legacy ZIP imports retain the full plan and independent editions',async()=>{
  let p=song([4,2]);p=editions.switchInstrumentEdition(p,'Piano','easy');
  p=music.replaceInstrumentMeasure(p,p.generatedScore,'Piano',0,[{pitch:64,start:0,duration:1.5}]);
  p=editions.applyPhrasePlan(p,planning.createPhrasePlan(p,3));
  const before=JSON.stringify(p);
  await io.saveProject(p);
  assert.equal(JSON.stringify(p),before);
  const saved=downloads.at(-1);assert.ok(saved);assert.match(saved.filename,/\.tango\.json$/);
  const restored=await io.loadProject(saved.blob);
  assert.deepEqual(restored.phrasePlan,p.phrasePlan);
  assert.deepEqual(restored.partEditions.Piano.easy.notes,p.partEditions.Piano.easy.notes);
  assert.ok(restored.protectedBars['Piano:0']);
  assert.deepEqual(planning.validatePhrasePlan(restored,restored.phrasePlan),[]);
  const legacyZip=new JSZip();legacyZip.file('project.json',await saved.blob.text());
  const legacy=await io.loadProject(new Blob([await legacyZip.generateAsync({type:'uint8array'})]));
  assert.deepEqual(legacy.phrasePlan,p.phrasePlan);
  assert.deepEqual(legacy.partEditions.Piano.easy.notes,restored.partEditions.Piano.easy.notes);
 });

 await check('real compressed print ZIP contains complete mixed-score and independent part rhythms at every level',async()=>{
  let p=song([4,3],['Piano','Contrabass','Violin I','Violin II','Bandoneon I','Voice']);
  p=editions.switchInstrumentEdition(p,'Piano','easy');
  p=editions.switchInstrumentEdition(p,'Piano','advanced');
  const plan=planning.createPhrasePlan(p,4);
  editPart(plan,0,'Violin II',{role:'rest'});editPart(plan,1,'Piano',{activity:.67,placement:'closing'});
  p=editions.applyPhrasePlan(p,plan);const before=JSON.stringify(p);
  const blob=await io.exportEditionPrintPack(p);
  assert.equal(blob.type,'application/zip');
  const zip=await JSZip.loadAsync(await blob.arrayBuffer(),{checkCRC32:true});
  const roster=music.projectInstruments(p),mixed=await zip.file('selected-ensemble.musicxml').async('string');
  assert.deepEqual(io.validateMusicXmlDurations(mixed,p.beats,roster.length),[]);
  for(const inst of roster)for(const level of editions.EDITION_LEVELS){
   const filename='parts/'+inst.toLowerCase().replace(/[^a-z0-9-]+/g,'-')+'/'+level+'.musicxml';
   const file=zip.file(filename);assert.ok(file,filename);
   const xml=await file.async('string');
   assert.deepEqual(io.validateMusicXmlDurations(xml,p.beats,1),[],filename);
   assert.equal((xml.match(/<measure\b/g)||[]).length,p.bars.length,filename);
  }
  const manifest=JSON.parse(await zip.file('edition-selections.json').async('string'));
  assert.ok(manifest.selection.find(entry=>entry.instrument==='Piano').stale.includes('easy'));
  assert.equal(JSON.stringify(p),before,'Export mutated song, plan or saved editions');
 });
 console.log(checks+' phrase-planning checks passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
