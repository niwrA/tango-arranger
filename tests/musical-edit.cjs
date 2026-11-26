const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const {ref,shallowRef,computed,watch}=require('vue');
const {createDomainLoader}=require('./load-domain.cjs');
const load=createDomainLoader();
const {blankProject}=load('src/music.ts');
const {executeMusicalEdit,editPartNoteKeys}=load('src/musicalEdit.ts');
const {exportProjectZip,loadProject}=load('src/io.ts');
const p=blankProject({sections:1,measuresPerSection:2,beats:4});
p.bars.forEach(b=>b.chord='Dm');
const score={'Violin I':[{pitch:69,start:0,duration:1},{pitch:72,start:4,duration:1}]};
const context={project:p,score,instrument:'Violin I',selection:{kind:'notes',keys:['0:69']}};
const before=JSON.stringify(p);
const changed=executeMusicalEdit(context,'pitch','1');
assert.equal(changed.score['Violin I'][0].pitch,70);
assert.equal(changed.score['Violin I'][1].pitch,72);
assert.equal(JSON.stringify(p),before);
const role=executeMusicalEdit({...context,selection:{kind:'measures',from:0,to:0}},'role','bass');
assert.equal(role.score['Violin I'][0].pitch,69);
assert.equal(role.project.measureRoles['Violin I:0'],'bass');
assert.throws(()=>executeMusicalEdit({...context,selection:{kind:'measures',from:0,to:1}},'create','generate'),/already contain notes/);
assert.equal(role.score,score);
assert.deepEqual(role.project.protectedBars,p.protectedBars);

const fixture=blankProject({sections:1,measuresPerSection:3,beats:4});
fixture.bars.forEach(bar=>bar.chord='Dm');
fixture.roles.A['Violin I']='chords';
fixture.instrumentSettings['Violin I'].activity=1;
fixture.protectedBars={'Violin I:2':true};
fixture.partEditions={'Violin I':{easy:{notes:[{pitch:65,start:0,duration:1}],protectedMeasures:[0],sourceSignature:'fixture'}}};
const imported={pitch:72,start:0,duration:1,source:'imported',lyric:'track'};
const part=[{pitch:71,start:0,duration:1,source:'imported'},imported];
const fullScore={'Violin I':part,Piano:[{pitch:48,start:0,duration:4}]};
const edit={project:fixture,score:fullScore,instrument:'Violin I',selection:{kind:'notes',keys:['0:71']}};
const original=JSON.stringify(edit);
const draft=executeMusicalEdit(edit,'pitch','-1');
assert.deepEqual(draft,executeMusicalEdit(edit,'pitch','-1'),'preview and direct evaluation produce identical transactions');
assert.equal(JSON.stringify(edit),original,'creating or discarding a draft leaves its input unchanged');
assert.deepEqual(draft.score['Violin I'].find(n=>n.pitch===72),imported);
assert.deepEqual(draft.score.Piano,fullScore.Piano);
assert.deepEqual(draft.project.protectedBars,{'Violin I:0':true,'Violin I:2':true});
assert.deepEqual(draft.project.partEditions,fixture.partEditions);
assert.throws(()=>executeMusicalEdit(edit,'pitch','1'),/same onset and pitch/);
assert.equal(JSON.stringify(edit),original,'failed commands do not alter input');
const range={...edit,selection:{kind:'measures',from:0,to:2}};
const fill=executeMusicalEdit(range,'create','generate');
assert.ok(fill.score['Violin I'].some(n=>n.start>=4&&n.start<8));
assert.deepEqual(fill.score['Violin I'].filter(n=>n.start<4),part);
assert.ok(fill.score['Violin I'].every(n=>n.start<8),'fill skips an intentionally protected rest');
assert.deepEqual(fill.project.measureRoles,fixture.measureRoles);
assert.deepEqual(fill.affectedMeasures,[1]);
assert.deepEqual(fill.warnings,['Skipped occupied or protected measure 1','Skipped occupied or protected measure 3']);
const replace=executeMusicalEdit({...range,role:'rest',selection:{kind:'measures',from:0,to:0}},'create','replace');
assert.deepEqual(replace.score['Violin I'],[],'explicit replacement can clear the selected written material');
assert.deepEqual(replace.project.measureRoles,fixture.measureRoles);
const insert=executeMusicalEdit({...range,role:'fill',entry:{bar:1,beat:3.75,pitch:74},duration:1},'create','insert');
assert.equal(insert.score['Violin I'].at(-1).duration,0.25);
assert.deepEqual(insert.project.measureRoles,fixture.measureRoles);
assert.throws(()=>executeMusicalEdit({...range,entry:{bar:0,beat:4,pitch:74}},'create','insert'),/outside/);
assert.throws(()=>executeMusicalEdit({...range,selection:{kind:'measures',from:-1,to:0}},'create','replace'),/outside/);

const scoped=blankProject({sections:1,measuresPerSection:10,beats:4});
const scopedNotes=[0,4,28,32,36].map((start,i)=>({start,pitch:69+i,duration:1}));
const scopedEdit={project:scoped,score:{'Violin I':scopedNotes},instrument:'Violin I'};
const editScope=(selection)=>executeMusicalEdit({...scopedEdit,selection},'pitch','1');
assert.deepEqual(editScope({kind:'phrase',measure:7}).score['Violin I'].map(n=>n.pitch),[70,71,72,72,73]);
assert.equal(editScope({kind:'part'}).count,5);
const beatRange=editScope({kind:'range',fromBeat:4,toBeat:32});
assert.deepEqual(beatRange.score['Violin I'].map(n=>n.pitch),[69,71,72,72,73]);
assert.deepEqual(beatRange.affectedMeasures,[1,7]);
assert.deepEqual(Object.keys(beatRange.project.protectedBars),['Violin I:1','Violin I:7']);
assert.throws(()=>editScope({kind:'range',fromBeat:4,toBeat:41}),/Beat range is outside/);
assert.throws(()=>executeMusicalEdit({...scopedEdit,selection:{kind:'range',fromBeat:4,toBeat:32}},'role','rest'),/whole measures/);

const unison=[{pitch:72,start:0,duration:2,xmlVoice:'1'},{pitch:72,start:0,duration:1,xmlVoice:'2'}];
const unisonKeys=editPartNoteKeys(unison);
assert.notEqual(unisonKeys.get(unison[0]),unisonKeys.get(unison[1]));
const unisonContext={...scopedEdit,score:{'Violin I':unison}};
assert.throws(()=>executeMusicalEdit({...unisonContext,selection:{kind:'notes',keys:['0:72']}},'pitch','1'),/stale or ambiguous/);
const oneVoice=executeMusicalEdit({...unisonContext,selection:{kind:'notes',keys:[unisonKeys.get(unison[1])]}},'pitch','1');
assert.deepEqual(oneVoice.score['Violin I'][0],unison[0]);
assert.equal(oneVoice.score['Violin I'][1].xmlVoice,'2');
const moved=executeMusicalEdit({...unisonContext,project:oneVoice.project,score:oneVoice.score,selection:{kind:'notes',keys:oneVoice.keys}},'timing','.25');
assert.deepEqual(moved.keys,oneVoice.keys);
assert.equal(moved.score['Violin I'][1].start,0.25);
const split=executeMusicalEdit({...unisonContext,project:moved.project,score:moved.score,selection:{kind:'notes',keys:moved.keys}},'structure','split');
assert.equal(split.keys.length,2);
assert.ok(split.keys.includes(oneVoice.keys[0]));
assert.equal(new Set(split.keys).size,2);
assert.equal(split.changes.modified.length,1);
assert.equal(split.changes.modified[0].before.duration,1);
assert.equal(split.changes.modified[0].after.duration,0.5);
assert.equal(split.changes.added.length,1);
assert.equal(split.changes.deleted.length,0);
const removed=executeMusicalEdit({...unisonContext,project:split.project,score:split.score,selection:{kind:'notes',keys:split.keys}},'structure','delete');
assert.deepEqual(removed.score['Violin I'],[unison[0]]);
assert.equal(removed.changes.deleted.length,2);
const recreated=executeMusicalEdit({...unisonContext,project:removed.project,score:removed.score,selection:{kind:'notes',keys:[]},entry:{bar:0,beat:0.25,pitch:73}},'create','insert');
assert.ok(!split.keys.includes(recreated.keys[0]),'new notes do not reuse IDs of deleted notes');
assert.throws(()=>executeMusicalEdit({...unisonContext,project:recreated.project,score:recreated.score,selection:{kind:'notes',keys:split.keys}},'pitch','1'),/stale or ambiguous/);

// Run the actual App handlers with Vue reactivity and a minimal editor fixture.
const app=fs.readFileSync('src/App.vue','utf8').replaceAll('\r\n','\n');
function appSlice(from,to){
 const start=app.indexOf(from);
 const end=app.indexOf(to,start+1);
 assert.ok(start>=0&&end>start,'App handler is present: '+from);
 return app.slice(start,end);
}
const harness=`
 const project=ref(seed), sourceScore=computed(()=>project.value.generatedScore);
 const score=sourceScore, noteInst=ref('Violin I'), selectedBar=ref(0), overviewFocus=ref(0);
 const noteSelected=ref(0), noteDetailsPopup=ref(false), message=ref('');
 const multiNoteMode=ref(false), multiNoteKeys=ref([]);
 const noteMeasure=computed(()=>score.value[noteInst.value].filter(n=>Math.floor(n.start/4)===selectedBar.value));
 const quickScope=ref('notes'), quickPreview=ref(true), quickRole=ref('inherit');
 const quickMode=ref('select'), quickNoteCategory=ref('pitch'), noteLength=ref('auto');
 const quickNoteKey=editNoteKey, selectedEvent=computed(()=>noteMeasure.value[noteSelected.value]);
 const quickSelection=computed(()=>({kind:'notes',keys:[quickNoteKey(selectedEvent.value)]}));
 const quickDraft=shallowRef(null);
 const mergeAnchor=shallowRef();
 let suppressNoteClick=false;
 function stopQuickAudition(){}
 function selectNoteEvent(index){noteSelected.value=index;}
 ${appSlice('const undoHistory=', 'watch(project,scheduleAutosave')}
 ${appSlice('function activateGridMeasure(', 'function continuousVisibleNotes(')}
 ${appSlice('const quickDisplayScore=', 'const quickRole=')}
 ${appSlice('watch(project,()=>{quickDraft', 'const quickAuditionPlaying=')}
 ${appSlice('function commitQuickDraft(', 'function insertFromScore(')}
 ${appSlice('function selectGridNote(', 'function editScoreSelection(')}
 return {project,score,quickDisplayScore,quickDraft,quickPreview,selectedEvent,applyQuickNote,commitQuickDraft,restoreHistory,selectGridNote,selectScoreNote,undoHistory,redoHistory};
`;
const seed={...fixture,generatedScore:fullScore};
const runtime=new Function('seed','ref','shallowRef','computed','watch','executeMusicalEdit','editNoteKey',ts.transpile(harness));
const editor=runtime(seed,ref,shallowRef,computed,watch,executeMusicalEdit,load('src/musicalEdit.ts').editNoteKey);
editor.selectGridNote(editor.score.value['Violin I'][1]);
assert.equal(editor.selectedEvent.value.pitch,72);
editor.selectScoreNote(editor.score.value['Violin I'][0]);
assert.equal(editor.selectedEvent.value.pitch,71);
editor.applyQuickNote('-1');
const preview=editor.quickDisplayScore.value;
assert.equal(preview['Violin I'][0].pitch,70);
assert.equal(editor.score.value['Violin I'][0].pitch,71);
assert.equal(editor.undoHistory.value.length,0);
editor.quickDraft.value=null;
assert.equal(editor.quickDisplayScore.value,editor.score.value);
editor.applyQuickNote('-1');
editor.commitQuickDraft();
assert.deepEqual(editor.score.value,preview);
assert.equal(editor.undoHistory.value.length,1);
editor.restoreHistory('undo');
assert.deepEqual(editor.score.value,fullScore);
editor.restoreHistory('redo');
assert.deepEqual(editor.score.value,preview);
editor.selectScoreNote(editor.score.value['Violin I'][0]);
editor.applyQuickNote('-1');
editor.project.value.bars[0].chord='Gm';
assert.equal(editor.quickDraft.value,null,'an in-place project change invalidates a draft');
editor.commitQuickDraft();
assert.deepEqual(editor.score.value,preview);
assert.equal(editor.redoHistory.value.length,0);
const direct=runtime(structuredClone(seed),ref,shallowRef,computed,watch,executeMusicalEdit,load('src/musicalEdit.ts').editNoteKey);
direct.quickPreview.value=false;
direct.applyQuickNote('-1');
assert.deepEqual(direct.score.value,preview);
assert.equal(direct.quickDraft.value,null);
assert.equal(direct.undoHistory.value.length,1);
assert.match(app,/:score="quickDisplayScore"/);
assert.match(app,/for\(const note of quickDisplayScore\.value\[noteInst\.value\]/);

(async()=>{
 const backup=await exportProjectZip(draft.project);
 const restored=await loadProject({arrayBuffer:()=>backup.arrayBuffer()});
 assert.deepEqual(restored.generatedScore['Violin I'],draft.score['Violin I']);
 assert.deepEqual(restored.protectedBars,draft.project.protectedBars);
 assert.deepEqual(restored.partEditions['Violin I'].easy,fixture.partEditions['Violin I'].easy);
 console.log('PASS shared musical edit selection, collisions, preview isolation, roles, protected rests and portable round trip');
})().catch(error=>{console.error(error);process.exitCode=1;});
