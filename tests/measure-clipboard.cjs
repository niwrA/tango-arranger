const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createDomainLoader}=require('./load-domain.cjs');
const load=createDomainLoader();
const {blankProject,generate,mergeScores,sectionSpans}=load('src/music.ts');
const {duplicateProjectSection}=load('src/sectionDuplication.ts');
const {
 ALL_MEASURE_FIELDS,copyMeasureRange,pasteMeasureRange,previewMeasurePaste,
 clearMeasureRange,insertBlankMeasures,deleteMeasureRange
}=load('src/measureClipboard.ts');
let checks=0;
function check(title,fn){fn();checks++;console.log('PASS '+title);}
const partOnly={chords:false,melody:false,notes:true,lyrics:true,settings:false};
function example(){
 const p=blankProject({sections:3,measuresPerSection:[4,4,4],beats:3,title:'Clipboard test'});
 p.bars[4].chord='D,A7';p.bars[4].melody=[{pitch:69,start:0,duration:1,lyric:'paz'}];
 p.bars[5].chord='B7';p.bars[5].melody=[{pitch:71,start:0,duration:1}];
 p.roles.B.Voice='melody';p.roles.B['Bandoneon I']='harmony';
 p.generatedScore={Voice:[{pitch:69,start:12,duration:1,lyric:'paz',syllabic:'single'},{pitch:70,start:15,duration:1,lyric:'flor'},{pitch:71,start:24,duration:1,lyric:'later'}],
 'Bandoneon I':[{pitch:64,start:12,duration:1},{pitch:65,start:15,duration:1}]};
 p.importedScore={Voice:p.generatedScore.Voice.map(n=>({...n}))};
 p.protectedBars['Voice:4']=true;p.protectedBars['Voice:5']=true;
 p.measureRoles={'Voice:4':'melody','Bandoneon I:5':'fill'};
 p.measureDynamics={'Voice:4':{start:'mp',end:'f'}};
 p.expressionRanges=[{instrument:'Voice',startMeasure:4,endMeasure:5,from:60,to:100}];
 p.partEditions={Voice:{easy:{notes:[{pitch:70,start:3,duration:1},{pitch:71,start:27,duration:1}],protectedMeasures:[9],sourceSignature:'before'}}};
 return p;
}
check('instrument notes/lyrics are time-relative and original project stays untouched',()=>{
 const p=example(),original=JSON.stringify(p),score=p.generatedScore;
 const c=copyMeasureRange(p,score,{start:4,end:5},['Voice'],partOnly);
 assert.equal(c.count,2);assert.deepEqual(c.parts.Voice.notes.map(n=>n.start),[0,3]);
 assert.equal(c.parts.Voice.notes[0].lyric,'paz');
 assert.equal(JSON.stringify(p),original);
});
check('single-part notes paste into Bandoneon without carrying lyrics',()=>{
 const p=example(),c=copyMeasureRange(p,p.generatedScore,{start:4,end:5},['Voice'],partOnly);
 const fields={...partOnly,lyrics:false};
 const preview=previewMeasurePaste(p,p.generatedScore,c,8,'overwrite',fields,'Bandoneon I');
 assert.equal(preview.incomingNotes,2);
 const next=pasteMeasureRange(p,p.generatedScore,c,8,'overwrite',fields,'Bandoneon I');
 assert.deepEqual(next.generatedScore['Bandoneon I'].filter(n=>n.start>=24).map(n=>n.start),[24,27]);
 assert.equal(next.generatedScore['Bandoneon I'].find(n=>n.start===24).lyric,undefined);
 assert.equal(next.protectedBars['Bandoneon I:8'],true);
 assert.equal(p.protectedBars['Bandoneon I:8'],undefined);
});
check('chord and lead melody clipboard does not overwrite other parts',()=>{
 const p=example(),score=p.generatedScore;
 const clip=copyMeasureRange(p,score,{start:4,end:5},[],{chords:true,melody:true,notes:false,lyrics:true,settings:false});
 const next=pasteMeasureRange(p,score,clip,8,'overwrite',clip.fields);
 assert.equal(next.bars[8].chord,'D,A7');
 assert.equal(next.bars[8].melody[0].lyric,'paz');
 assert.deepEqual(next.importedScore?.Voice,p.importedScore.Voice);
});
check('copy explicit roles and dynamics to another instrument',()=>{
 const p=example(),fields={chords:false,melody:false,notes:false,lyrics:false,settings:true};
 const c=copyMeasureRange(p,p.generatedScore,{start:4,end:5},['Voice'],fields);
 const n=pasteMeasureRange(p,p.generatedScore,c,8,'overwrite',fields,'Bandoneon I');
 assert.equal(n.measureRoles['Bandoneon I:8'],'melody');
 assert.equal(n.measureDynamics['Bandoneon I:8'].start,'mp');
 assert.ok(n.expressionRanges.some(r=>r.instrument==='Bandoneon I'&&r.startMeasure===8&&r.endMeasure===9));
});
check('clearing protected Voice notes retains silence after regeneration',()=>{
 const p=example();
 const n=clearMeasureRange(p,p.generatedScore,{start:4,end:5},['Voice'],partOnly,true);
 assert.equal(n.protectedBars['Voice:4'],true);
 assert.equal(n.measureRoles['Voice:4'],'rest');
 assert.equal(n.importedScore.Voice.length,1);
 assert.equal(n.importedScore.Voice[0].start,24);
 assert.equal(mergeScores(n,generate(n)).Voice.some(note=>note.start>=12&&note.start<18),false);
 assert.equal(p.importedScore.Voice.length,3);
});
check('insert shifts source, lyrics and all difficulty editions without dropping them',()=>{
 const p=example();
 const n=insertBlankMeasures(p,6,2);
 assert.equal(n.bars.length,14);
 assert.equal(n.bars[6].chord,'');
 assert.equal(n.generatedScore.Voice.find(note=>note.pitch===70).start,15);
 assert.equal(n.generatedScore.Voice.find(note=>note.pitch===71).start,30);
 assert.equal(n.partEditions.Voice.easy.notes[1].start,33);
 assert.equal(n.partEditions.Voice.easy.protectedMeasures[0],11);
 assert.equal(n.expressionRanges[0].endMeasure,7);
 assert.equal(n.measureRoles['Bandoneon I:5'],'fill');
});
check('delete shifts later scores, metadata, editions while preserving earlier notes',()=>{
 const p=example();p.measureDynamics['Voice:9']={start:'f'};
 const n=deleteMeasureRange(p,{start:5,end:6});
 assert.equal(n.bars.length,10);
 assert.equal(n.generatedScore.Voice.some(note=>note.start===15),false);
 assert.equal(n.generatedScore.Voice.find(note=>note.pitch===71).start,18);
 assert.equal(n.partEditions.Voice.easy.notes[1].start,21);
 assert.equal(n.partEditions.Voice.easy.protectedMeasures[0],7);
 assert.equal(n.measureDynamics['Voice:7'].start,'f');
});
check('section boundary and overall song safety guards',()=>{
 const p=example();
 assert.throws(()=>deleteMeasureRange(p,{start:4,end:7}),/Delete a complete section/);
 assert.throws(()=>deleteMeasureRange(p,{start:0,end:11}),/at least one measure/);
 assert.throws(()=>insertBlankMeasures(p,3,600),/512/);
 const clip=copyMeasureRange(p,p.generatedScore,{start:4,end:5},['Voice'],partOnly);
 assert.throws(()=>pasteMeasureRange(p,p.generatedScore,clip,11,'overwrite',partOnly),/do not fit/);
 assert.throws(()=>pasteMeasureRange({...p,beats:4},p.generatedScore,clip,8,'overwrite',partOnly),/time signature/);
});
check('real Pequeña C can be duplicated as E and Voice melody copied into bandoneon',()=>{
 const p=JSON.parse(fs.readFileSync('src/presets/pequena-2.json','utf8'));
 const copied=duplicateProjectSection(p,2).project;
 assert.equal(copied.bars.length,163);
 assert.equal(sectionSpans(copied)[4].label,'E');
 const clip=copyMeasureRange(copied,mergeScores(copied,copied.generatedScore),{start:130,end:146},['Voice'],partOnly);
 const edit={...partOnly,lyrics:false};
 const b=pasteMeasureRange(copied,mergeScores(copied,copied.generatedScore),clip,130,'overwrite',edit,'Bandoneon I');
 const done=clearMeasureRange(b,mergeScores(b,b.generatedScore),{start:130,end:146},['Voice'],partOnly,true);
 assert.ok(done.generatedScore['Bandoneon I'].some(n=>n.start>=390&&n.start<441));
 assert.ok(!mergeScores(done,generate(done)).Voice.some(n=>n.start>=390&&n.start<441));
 assert.ok(mergeScores(done,generate(done)).Voice.some(n=>n.start>=441));
 assert.equal(p.bars.length,130);
});
const app=fs.readFileSync('src/App.vue','utf8'),css=fs.readFileSync('src/style.css','utf8');
check('shared toolbar exposed across workspaces with long-hold anchor and preview actions',()=>{
 for(const fragment of ['measure-edit-shell','beginMeasureHold(measure)','onMeasureRangeTap(i,$event)','onMeasureRangeTap(span.start+offset-1,$event)','startNoteMeasureRangeHold(barIndex)','previewMeasureOperation','applyMeasureOperation','measurePasteTarget'])assert.ok(app.includes(fragment),fragment);
 assert.ok(css.includes('.measure-edit-shell'));
});
console.log(checks+' measure clipboard, integration and Pequeña reprise checks passed');
