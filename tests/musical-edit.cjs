const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const {ref,shallowRef,computed,watch}=require('vue');
const {DOMParser}=require('@xmldom/xmldom');
const {createDomainLoader}=require('./load-domain.cjs');
const load=createDomainLoader();
const {blankProject,adaptTransposedScore,chordAt,chordTones,keyPitchClasses}=load('src/music.ts');
const {executeMusicalEdit,editPartNoteKeys,editNoteKey,musicalEditActions,resolveEditSelection}=load('src/musicalEdit.ts');
const {dragAbsoluteNoteLeftEdge,dragAbsoluteNotePosition}=load('src/noteEditing.ts');
const {exportProjectZip,exportMusicXml,loadProject}=load('src/io.ts');
const {readScoreEntryNotation,scoreEntryPitch,scoreEntryBeat,scoreEntryOctaveShift}=load('src/scoreEntry.ts');
const {projectEditPreview}=load('src/editPreview.ts');
const {draftAuditionEvents}=load('src/editAudition.ts');
const {normalizeBrushStroke,brushPitchAt}=load('src/brushGesture.ts');
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
const displayedBefore=part.map(note=>({...note,pitch:note.pitch+12}));
const displayedAfter=draft.score['Violin I'].map(note=>({...note,pitch:note.pitch+12}));
const marks=projectEditPreview(draft.changes,part,displayedBefore,draft.score['Violin I'],displayedAfter);
assert.deepEqual(marks.before,[{note:displayedBefore[0],kind:'original'}]);
assert.equal(marks.after.get(displayedAfter[0]),'modified');
assert.equal(marks.after.has(displayedAfter[1]),false);
const removalPreview=executeMusicalEdit(edit,'structure','delete');
assert.deepEqual(projectEditPreview(removalPreview.changes,part,displayedBefore,removalPreview.score['Violin I'],removalPreview.score['Violin I']).before,[{note:displayedBefore[0],kind:'deleted'}]);
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
const lyrics=[
 {pitch:62,start:3,duration:1,lyric:'tan',syllabic:'begin',lyric2:'ar',syllabic2:'begin'},
 {pitch:62,start:4,duration:0.5,lyric:'go',syllabic:'end',lyric2:'te',syllabic2:'end',xmlTieContinuation:true}
];
const joined=executeMusicalEdit({project:scoped,score:{Voice:lyrics},instrument:'Voice',selection:{kind:'notes',keys:lyrics.map(editNoteKey)}},'structure','merge');
assert.deepEqual(joined.affectedMeasures,[0,1]);
assert.equal(joined.score.Voice.length,1);
assert.equal(joined.score.Voice[0].duration,1.5);
assert.equal(joined.score.Voice[0].lyric,'tango');
assert.equal(joined.score.Voice[0].lyric2,'arte');
assert.equal(joined.changes.modified[0].before,lyrics[0]);
assert.deepEqual(joined.changes.deleted,[lyrics[1]]);
const tiedPart=[
 {pitch:67,start:3,duration:1,xmlVoice:'1'},
 {pitch:67,start:4,duration:1,xmlVoice:'1',xmlTieContinuation:true},
 {pitch:67,start:4,duration:1,xmlVoice:'2'}
];
const tiedContext={project:scoped,score:{'Violin I':tiedPart},instrument:'Violin I'};
const tiedKeys=editPartNoteKeys(tiedPart);
const editTies=(notes,category,action)=>executeMusicalEdit({...tiedContext,selection:{kind:'notes',keys:notes.map(note=>tiedKeys.get(note))}},category,action);
assert.throws(()=>editTies([tiedPart[0]],'pitch','1'),/tie outside the selection/);
assert.equal(tiedPart[1].xmlTieContinuation,true);
const tiedUp=editTies(tiedPart.slice(0,2),'pitch','1');
assert.equal(tiedUp.score['Violin I'].find(note=>note.start===4&&note.pitch===68).xmlTieContinuation,true);
assert.deepEqual(tiedUp.score['Violin I'].find(note=>note.xmlVoice==='2'),tiedPart[2]);
const continuationOnly=editTies([tiedPart[1]],'pitch','1');
assert.equal(continuationOnly.score['Violin I'].find(note=>note.pitch===68).xmlTieContinuation,undefined);
assert.match(continuationOnly.warnings[0],/Removed the separated tie/);
const tiedSplit=editTies([tiedPart[0]],'structure','split');
assert.equal(tiedSplit.score['Violin I'].find(note=>note.start===3.5).xmlTieContinuation,undefined);
assert.equal(tiedSplit.score['Violin I'].find(note=>note.start===4&&note.xmlVoice==='1').xmlTieContinuation,true);
const untied=editTies(tiedPart,'structure','untie');
assert.deepEqual(untied.affectedMeasures,[1]);
assert.equal(untied.score['Violin I'].find(note=>note.xmlVoice==='1'&&note.start===4).xmlTieContinuation,undefined);
const offGrid=[{pitch:69,start:0.2,duration:0.5},{pitch:72,start:0.2,duration:0.75}];
const snapContext={project:scoped,score:{'Violin I':offGrid},instrument:'Violin I',
 selection:{kind:'notes',keys:offGrid.map(editNoteKey)},snapPreset:'marcato_four'};
const snapped=executeMusicalEdit(snapContext,'rhythm','snap-onset');
assert.deepEqual(snapped.score['Violin I'].map(note=>[note.start,note.duration,note.rhythmSource.preset]),[[0,0.5,'marcato_four'],[0,0.75,'marcato_four']]);
assert.deepEqual(offGrid.map(note=>note.start),[0.2,0.2]);
const entered=executeMusicalEdit({...snapContext,selection:{kind:'notes',keys:[]},duration:0.5,entry:{
 bar:0,beat:1,pitch:70,articulation:'marcato_staccato',rhythm:{preset:'marcato_four',originalBeat:1.2,accent:true}
}},'create','insert');
assert.equal(entered.changes.added[0].articulation,'marcato_staccato');
assert.equal(entered.changes.added[0].accent,true);
assert.equal(entered.changes.added[0].rhythmSource.targetDuration,0.5);

const notation=readScoreEntryNotation(new DOMParser().parseFromString(`<score-partwise><part>
 <measure><attributes><divisions>6</divisions><key><fifths>1</fifths></key>
  <clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef>
 </attributes><note><rest/><duration>8</duration></note>
 <note><pitch><step>F</step><octave>4</octave></pitch><duration>4</duration></note>
 <note><chord/><pitch><step>G</step><alter>1</alter><octave>4</octave></pitch><duration>4</duration></note>
 <backup><duration>12</duration></backup>
 <note><pitch><step>F</step><alter>-1</alter><octave>4</octave></pitch><duration>12</duration><staff>2</staff></note></measure>
 <measure><note><pitch><step>F</step><octave>4</octave></pitch><duration>6</duration><tie type="stop"/></note></measure>
 <measure><attributes><key><fifths>-2</fifths></key></attributes></measure>
 </part></score-partwise>`,'text/xml'));
assert.equal(scoreEntryPitch(notation[0],1,1,1,0),66,'F sharp from the active signature');
assert.equal(scoreEntryPitch(notation[0],1,1,4/3,0),65,'local natural after a triplet onset');
assert.equal(scoreEntryPitch(notation[0],1,2,2,0),68,'local chord accidental');
assert.equal(scoreEntryPitch(notation[0],2,6,0,0),54,'bass clef fourth line follows the F sharp signature');
assert.equal(scoreEntryPitch(notation[0],2,13,1,0),64,'bass staff carries its own accidental');
assert.equal(scoreEntryPitch(notation[1],1,1,1,0),66,'a continuation keeps its pitch without changing the new bar accidental');
assert.equal(scoreEntryPitch(notation[2],1,0,2,2),61,'empty staff follows new key and reverses global transposition');
assert.equal(scoreEntryPitch(notation[2],1,-2,0,0),60,'first lower ledger line');
assert.equal(scoreEntryPitch(notation[2],1,10,0,0),81,'first upper ledger line');
const columns=[{x:60,beat:0},{x:142,beat:4/3},{x:164,beat:2}];
assert.equal(scoreEntryBeat(145,columns,50,215,4,0.5),4/3,'exact engraved triplet column');
assert.equal(scoreEntryBeat(101,columns,50,215,4,0.5),0.5,'interpolate between nonuniform columns');
assert.equal(scoreEntryBeat(180,[],50,215,4,0.5),3,'empty staff spans the whole measure');
assert.equal(scoreEntryBeat(215,[],50,215,4,1/3),11/3,'last tuplet slot stays in the measure');
const grandStaffEdit=executeMusicalEdit({project:fixture,score:{Piano:[]},instrument:'Piano',selection:{kind:'notes',keys:[]},
 duration:1,entry:{bar:0,beat:3,pitch:64,notation:{staff:2,octaveShift:-12}}},'create','insert');
const grandStaffNote=grandStaffEdit.changes.added[0];
assert.equal(grandStaffNote.staffOverride,2);
assert.equal(grandStaffNote.xmlOctaveShift,-12);
const grandStaffContinuation=executeMusicalEdit({project:grandStaffEdit.project,score:grandStaffEdit.score,instrument:'Piano',selection:{kind:'notes',keys:[]},
 duration:1,entry:{bar:1,beat:0,pitch:65,notation:{staff:2,octaveShift:-12}}},'create','insert');
const grandStaffXml=exportMusicXml(grandStaffContinuation.project,grandStaffContinuation.score,{onlyInstrument:'Piano',engravingPreview:true});
assert.match(grandStaffXml,/<note><pitch><step>E<\/step><octave>4<\/octave><\/pitch>(?:(?!<\/note>).)*<staff>2<\/staff>/);
const ottava=readScoreEntryNotation(new DOMParser().parseFromString(grandStaffXml,'text/xml'));
assert.equal(scoreEntryOctaveShift(ottava[0],2,2.5),0);
assert.equal(scoreEntryOctaveShift(ottava[0],2,3),-12);
assert.equal(scoreEntryOctaveShift(ottava[1],2,.5),-12);
assert.equal(scoreEntryOctaveShift(ottava[1],2,1.5),0);
assert.equal(scoreEntryOctaveShift(ottava[0],1,3),0);
assert.equal(scoreEntryPitch(ottava[0],2,5,3,0),64,'bass-clef E3 under 8va resolves to sounding E4');

const auditionProject={...fixture,bpm:120,transposeSemitones:2,
 expressionRanges:[{instrument:'Violin I',startMeasure:0,endMeasure:0,from:60,to:105}],
 tempoExpressions:{ritardandos:[{startMeasure:0,endMeasure:0,toPercent:50}],fermatas:[],aTempoMeasures:[1]}};
const auditionScore={'Violin I':[{pitch:69,start:2,duration:1,velocity:80,slideTo:71}],Piano:[{pitch:48,start:0,duration:2}]};
const solo=draftAuditionEvents(auditionProject,auditionScore,'Violin I',0,0,.5);
assert.equal(solo.events.length,1);
assert.equal(solo.events[0].event.pitch,71);
assert.equal(solo.events[0].event.slideTo,73);
assert.ok(solo.events[0].event.endVelocity>solo.events[0].event.velocity);
assert.ok(solo.events[0].onset>2&&solo.events[0].duration>1&&solo.length>4,'ritardando and half speed stretch the audition');
const ensemble=draftAuditionEvents(auditionProject,auditionScore,'Violin I',0,0,.5,true);
assert.deepEqual(ensemble.events.map(({instrument})=>instrument),['Piano','Violin I']);
assert.deepEqual(ensemble.events[1],solo.events[0]);

const strokes=[{beat:3,pitch:77},{beat:0,pitch:62},{beat:1,pitch:64},{beat:1,pitch:67}];
const stroke=normalizeBrushStroke(strokes,1,8);
assert.deepEqual(stroke,{fromBeat:0,toBeat:4,points:[{beat:0,pitch:62},{beat:1,pitch:67},{beat:3,pitch:77}]});
assert.equal(brushPitchAt(stroke.points,2,72),72);
assert.equal(normalizeBrushStroke([{beat:8,pitch:60},{beat:1,pitch:NaN}],1,8),undefined);
const brushProject=blankProject({sections:1,measuresPerSection:3,beats:4});
brushProject.bars.forEach(bar=>bar.chord='Dm,G7');
brushProject.sectionKeys.A='Dm';
const pianoReference=[{pitch:65,start:5,duration:1,source:'imported'}];
const brushContext={project:brushProject,score:{Piano:pianoReference,'Violin I':[]},instrument:'Violin I',
 selection:{kind:'range',fromBeat:0,toBeat:4}};
const brushEdit=(kind,ctx=brushContext,replace=false,range=stroke)=>executeMusicalEdit({...ctx,brush:{kind,stroke:range,rhythm:'marcato_four',referencePitch:65,replace}},'create','brush');
const melodyBrush=brushEdit('melody');
assert.deepEqual(melodyBrush.affectedMeasures,[0]);
assert.ok(melodyBrush.changes.added.at(-1).pitch>melodyBrush.changes.added[0].pitch);
assert.deepEqual(melodyBrush.score.Piano,pianoReference);
assert.deepEqual(melodyBrush.project.measureRoles,brushProject.measureRoles);
const arpBrush=brushEdit('arpeggio');
assert.equal(arpBrush.changes.added.length,4);
for(const note of arpBrush.changes.added)assert.ok(chordTones(chordAt(brushProject.bars[0].chord,4,note.start)).includes(note.pitch%12));
const bassBrush=brushEdit('bass',{...brushContext,instrument:'Contrabass'});
assert.ok(bassBrush.changes.added.every(note=>note.pitch<=55));
const chordBrush=brushEdit('voicings',{...brushContext,instrument:'Piano'});
assert.ok(chordBrush.changes.added.some((note,index,notes)=>notes[index+1]?.start===note.start));
const repeatBrush=brushEdit('repetition');
assert.equal(new Set(repeatBrush.changes.added.map(note=>note.pitch)).size,1);
assert.ok(repeatBrush.changes.added.every(note=>note.rhythmSource?.preset==='marcato_four'));
const resolution={pitch:76,start:4,duration:1};
const approachContext={...brushContext,score:{'Violin I':[resolution]}};
const chromaticBrush=brushEdit('chromatic',approachContext);
assert.deepEqual(chromaticBrush.changes.added.map(note=>note.pitch),[72,73,74,75]);
const diatonicBrush=brushEdit('diatonic',approachContext);
assert.ok(diatonicBrush.changes.added.every(note=>keyPitchClasses('Dm').includes(note.pitch%12)&&note.pitch<76));
const protectedNote={pitch:67,start:4,duration:1,source:'manual'};
const generatedAttack={pitch:66,start:0,duration:1,source:'generated'};
const originalBrushScore={Piano:pianoReference,'Violin I':[generatedAttack,protectedNote]};
const extendedBrush={...brushContext,project:{...brushProject,protectedBars:{'Violin I:1':true},partEditions:fixture.partEditions},
 score:originalBrushScore,selection:{kind:'range',fromBeat:0,toBeat:8}};
const extendedStroke={...stroke,toBeat:8};
const preservingBrush=brushEdit('melody',extendedBrush,false,extendedStroke);
assert.equal(preservingBrush.changes.deleted.length,0);
assert.ok(preservingBrush.changes.added.every(note=>note.start>=1&&note.start<4));
assert.match(preservingBrush.warnings.join(' '),/occupied beats in measure 1/);
assert.match(preservingBrush.warnings.join(' '),/protected material in measure 2/);
const replacingBrush=brushEdit('melody',extendedBrush,true,extendedStroke);
assert.deepEqual(replacingBrush.changes.deleted,[generatedAttack]);
assert.deepEqual(replacingBrush.project.partEditions,fixture.partEditions);
assert.deepEqual(replacingBrush.score['Violin I'].at(-1),protectedNote);
assert.deepEqual(originalBrushScore['Violin I'],[generatedAttack,protectedNote]);

const lockedFinger={pitch:69,start:0,duration:1,stringMidi:69,finger:'0',source:'imported',lyric:'manual'};
const tiedFinger={pitch:69,start:1,duration:1,xmlTieContinuation:true,xmlVoice:'1'};
const openDouble=[{pitch:55,start:2,duration:1},{pitch:62,start:2,duration:1}];
const impossibleFinger={pitch:60,start:3,duration:1,stringMidi:76,handPosition:'I'};
const stringPart=[lockedFinger,tiedFinger,...openDouble,impossibleFinger];
const stringContext={project:brushProject,score:{'Violin I':stringPart,Piano:pianoReference},instrument:'Violin I',selection:{kind:'part'}};
const fingering=executeMusicalEdit(stringContext,'position','plan-shifts');
assert.deepEqual(fingering.score['Violin I'].map(note=>[note.pitch,note.start,note.duration]),stringPart.map(note=>[note.pitch,note.start,note.duration]));
assert.deepEqual(fingering.score['Violin I'][0],lockedFinger);
assert.equal(fingering.score['Violin I'][1].xmlTieContinuation,true);
assert.equal(fingering.score['Violin I'][1].stringMidi,69);
assert.deepEqual(fingering.score['Violin I'].slice(2,4).map(note=>[note.stringMidi,note.finger]),[[55,'0'],[62,'0']]);
assert.match(fingering.warnings.join(' '),/No compatible fingering in measure 1, beat 4/);
assert.deepEqual(fingering.score['Violin I'].at(-1),impossibleFinger);
assert.deepEqual(fingering.score.Piano,pianoReference);
const sameString=executeMusicalEdit(stringContext,'position','plan-crossings');
assert.equal(sameString.changes.modified.length,3);
const concertFingering=executeMusicalEdit({...stringContext,project:{...brushProject,transposeSemitones:2},
 score:{'Violin I':[{pitch:67,start:0,duration:1,stringMidi:69}]}},'position','plan-shifts');
assert.equal(concertFingering.changes.modified[0].after.finger,'0');
assert.equal(concertFingering.changes.modified[0].after.pitch,67);
assert.throws(()=>executeMusicalEdit({...stringContext,instrument:'Piano'},'position','plan-shifts'),/Unsupported/);
const lockedBow={pitch:69,start:0,duration:1,gate:1,bowDirection:'up',articulation:'legato'};
const tiedBow={pitch:69,start:1,duration:1,xmlTieContinuation:true,articulation:'legato'};
const pluck={pitch:71,start:2,duration:.5,technique:'pizzicato'};
const accentBow={pitch:72,start:3,duration:1,accent:true};
const bowNotes=[lockedBow,tiedBow,pluck,accentBow];
const bowing=executeMusicalEdit({...stringContext,score:{'Violin I':bowNotes}},'bow','plan-down');
assert.deepEqual(bowing.score['Violin I'].map(note=>note.bowDirection),['up','up',undefined,'down']);
assert.equal(bowing.score['Violin I'][1].xmlTieContinuation,true);
assert.deepEqual(bowing.score['Violin I'][2],pluck);
const longBow={pitch:79,start:4,duration:3,gate:1,velocity:112};
const slowBowing=executeMusicalEdit({...stringContext,project:{...brushProject,bpm:40},score:{'Violin I':[{...lockedBow,bowDirection:undefined},longBow]}},'bow','plan-up');
assert.match(slowBowing.warnings.join(' '),/Long bow in measure 2/);
assert.deepEqual(slowBowing.score['Violin I'].map(note=>note.bowDirection),['up','up']);
const conflict={...tiedBow,bowDirection:'down'};
assert.throws(()=>executeMusicalEdit({...stringContext,score:{'Violin I':[lockedBow,conflict]}},'bow','plan-up'),/Conflicting locked bows/);
const inheritedPizz={pitch:72,start:4,duration:1};
const mixedBowing=executeMusicalEdit({...stringContext,project:{...brushProject,measureViolinTechniques:{'Violin II:0':'tango_staccato','Violin II:1':'pizzicato'}},
 instrument:'Violin II',score:{'Violin II':[{pitch:69,start:0,duration:1},inheritedPizz]}},'bow','plan-down');
assert.equal(mixedBowing.score['Violin II'][0].bowDirection,'down');
assert.deepEqual(mixedBowing.score['Violin II'][1],inheritedPizz);

// Run the actual App handlers with Vue reactivity and a minimal editor fixture.
const app=fs.readFileSync('src/App.vue','utf8').replaceAll('\r\n','\n');
function appSlice(from,to){
 const start=app.indexOf(from);
 const end=app.indexOf(to,start+1);
 assert.ok(start>=0&&end>start,'App handler is present: '+from);
 return app.slice(start,end);
}
// The status is allowed to count measures, but the bow controls depend on notes.
const bowToolbar=new Function('project','score','ref','computed','resolveEditSelection','musicalEditActions',ts.transpile(`
 const quickScope=ref('measures'),noteInst=ref('Violin I'),quickNoteCategory=ref('bow');
 const selection=ref({kind:'measures',from:0,to:0});
 const resolvedQuickSelection=computed(()=>resolveEditSelection(project,score['Violin I'],selection.value));
 ${appSlice('const quickSelectionCount=', 'function quickNoteSelected(')}
 return {selection,quickSelectionCount,quickActionSelectionCount,quickNoteActions,quickNoteCategory};
`))(fixture,{'Violin I':[{pitch:71,start:0,duration:1},{pitch:72,start:1,duration:1},{pitch:74,start:8,duration:1}]},ref,computed,resolveEditSelection,musicalEditActions);
const bowButtons=()=>bowToolbar.quickNoteActions.value.map(a=>a.value);
assert.equal(bowToolbar.quickSelectionCount.value,1);
assert.equal(bowToolbar.quickActionSelectionCount.value,2);
assert.deepEqual(bowButtons(),['plan-down','plan-up','alternate','arco','pizzicato','clear']);
bowToolbar.selection.value={kind:'measures',from:1,to:2};
assert.equal(bowToolbar.quickSelectionCount.value,2);
assert.equal(bowToolbar.quickActionSelectionCount.value,1);
assert.deepEqual(bowButtons(),['down','up','alternate','arco','pizzicato','clear']);
bowToolbar.selection.value={kind:'measures',from:1,to:1};
assert.equal(bowToolbar.quickActionSelectionCount.value,0);
bowToolbar.quickNoteCategory.value='pitch';
assert.equal(bowToolbar.quickActionSelectionCount.value,1,'non-bow categories retain existing selection handling');
assert.match(app,/!quickActionSelectionCount&&/);
console.log('PASS bow toolbar uses sounding-note selection rather than measure count');

const harness=`
 const project=ref(seed), sourceScore=computed(()=>project.value.generatedScore);
 const score=computed(()=>adaptTransposedScore(sourceScore.value,project.value));
 const noteInst=ref('Violin I'), selectedBar=ref(0), overviewFocus=ref(0);
 const noteSelected=ref(0), noteDetailsPopup=ref(false), message=ref('');
 const multiNoteMode=ref(false), multiNoteKeys=ref([]);
 const noteMeasure=computed(()=>score.value[noteInst.value].filter(n=>Math.floor(n.start/4)===selectedBar.value));
 const quickScope=ref('notes'), quickPreview=ref(true), quickRole=ref('inherit');
 const quickMode=ref('select'), quickNoteCategory=ref('pitch'), noteLength=ref('auto');
 const quickBrushActive=ref(false);
 const selectedEvent=computed(()=>noteMeasure.value[noteSelected.value]);
 const quickSelection=computed(()=>({kind:'notes',keys:[quickNoteKey(selectedEvent.value)]}));
 const quickDraft=shallowRef(null);
 const mergeAnchor=shallowRef();
 const active=ref('notes'),noteEditorTab=ref('notes'),noteFocusMode=ref(false),noteFocusMore=ref(false);
 const noteStep=ref(0.25),noteCtx=ref({range:[55,96]}),noteBeats=ref(Array(16)),focusVisibleMeasures=ref([0,1]);
 function effectiveNoteRhythmPreset(){return 'off';}
 function snapEditorEntry(entry){return entry;}
 function stopQuickAudition(){}
 function auditionEvent(){}
 function focusSelectedNoteButton(){}
 function selectNoteEvent(index){noteSelected.value=index;}
 ${appSlice('const undoHistory=', 'watch(project,scheduleAutosave')}
 ${appSlice('type NoteDrag=', 'function nudgeSelectedNote(')}
 ${appSlice('function activateGridMeasure(', 'function continuousVisibleNotes(')}
 ${appSlice('const quickDisplayScore=', 'const quickRole=')}
 ${appSlice('const quickSourceKeys=', 'const quickSelection=')}
 ${appSlice('watch(project,()=>{quickDraft', 'const quickAuditionPlaying=')}
 ${appSlice('function commitQuickDraft(', 'function proposeMusicalBrush(')}
 ${appSlice('function moveScoreNote(', 'function selectGridNote(')}
 ${appSlice('function selectGridNote(', 'function editScoreSelection(')}
 ${appSlice('function commitImmediateEdit(', 'function updatePianoExpression(')}
 ${appSlice('function deleteSelectedNote(', 'function restoreNoteMeasure(')}
 return {project,score,quickDisplayScore,quickDraft,quickPreview,selectedEvent,applyQuickNote,commitQuickDraft,restoreHistory,selectGridNote,selectScoreNote,undoHistory,redoHistory,beginNoteDrag,moveNoteDrag,endNoteDrag,moveScoreNote,commitInspectedNote,deleteSelectedNote,clearNoteMeasure};
`;
const seed={...fixture,generatedScore:fullScore};
const runtime=new Function('seed','ref','shallowRef','computed','watch','executeMusicalEdit','editNoteKey','editPartNoteKeys','adaptTransposedScore','dragAbsoluteNoteLeftEdge','dragAbsoluteNotePosition',ts.transpile(harness));
const launch=project=>runtime(project,ref,shallowRef,computed,watch,executeMusicalEdit,editNoteKey,editPartNoteKeys,adaptTransposedScore,dragAbsoluteNoteLeftEdge,dragAbsoluteNotePosition);
const scoreDrag=launch(seed);
const sourceNote=scoreDrag.score.value['Violin I'][0];
scoreDrag.moveScoreNote(sourceNote,1.5,2);
assert.equal(scoreDrag.score.value['Violin I'][0],sourceNote,'score drag stages a draft');
assert.deepEqual(scoreDrag.quickDisplayScore.value['Violin I'].map(note=>[note.start,note.pitch]),[[0,72],[1.5,73]]);
scoreDrag.commitQuickDraft();
assert.equal(scoreDrag.selectedEvent.value.pitch,73);
assert.equal(scoreDrag.undoHistory.value.length,1);
scoreDrag.restoreHistory('undo');
assert.equal(scoreDrag.score.value['Violin I'][0].pitch,71);
const editor=launch(seed);
editor.selectGridNote(editor.score.value['Violin I'][1]);
assert.equal(editor.selectedEvent.value.pitch,72);
editor.selectScoreNote(editor.score.value['Violin I'][0]);
assert.equal(editor.selectedEvent.value.pitch,71);
editor.applyQuickNote('-1');
const preview=editor.quickDisplayScore.value;
assert.equal(preview['Violin I'][0].pitch,70);
assert.equal(editor.score.value['Violin I'][0].pitch,71);
assert.equal(editor.undoHistory.value.length,0);
assert.equal(editor.applyQuickNote('-12'),false);
assert.equal(editor.quickDisplayScore.value,preview);
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
const direct=launch(structuredClone(seed));
direct.quickPreview.value=false;
direct.applyQuickNote('-1');
assert.deepEqual(direct.score.value,preview);
assert.equal(direct.quickDraft.value,null);
assert.equal(direct.undoHistory.value.length,1);
const dragEditor=launch(structuredClone(seed));
const grid={getBoundingClientRect:()=>({width:320,height:20})};
let capturedPointer;
const scroller={setPointerCapture:id=>{capturedPointer=id;}};
const down={pointerId:3,isPrimary:true,button:0,clientX:0,clientY:0,
 currentTarget:{closest:selector=>selector==='.note-lane-grid'?grid:scroller},target:{closest:()=>null}};
const move={...down,clientX:160,clientY:-20};
dragEditor.beginNoteDrag(down,dragEditor.score.value['Violin I'][0]);
assert.equal(capturedPointer,3);
dragEditor.moveNoteDrag(move);
assert.equal(dragEditor.quickDisplayScore.value['Violin I'].at(-1).start,4);
assert.equal(dragEditor.quickDisplayScore.value['Violin I'].at(-1).pitch,72);
assert.deepEqual(dragEditor.score.value,fullScore);
assert.equal(dragEditor.undoHistory.value.length,0);
dragEditor.endNoteDrag({...move,type:'pointercancel'});
assert.equal(dragEditor.quickDraft.value,null);
assert.deepEqual(dragEditor.score.value,fullScore);
dragEditor.quickPreview.value=false;
dragEditor.beginNoteDrag(down,dragEditor.score.value['Violin I'][0]);
dragEditor.moveNoteDrag(move);
assert.equal(dragEditor.undoHistory.value.length,0);
dragEditor.endNoteDrag({...move,type:'pointerup'});
assert.equal(dragEditor.score.value['Violin I'].at(-1).start,4);
assert.equal(dragEditor.selectedEvent.value.pitch,72);
assert.equal(dragEditor.undoHistory.value.length,1);
dragEditor.restoreHistory('undo');
assert.deepEqual(dragEditor.score.value,fullScore);
const adaptive=launch({
 ...scoped,transposeSemitones:-2,
 adaptiveTranspose:{enabled:true,semitones:-2,chordToneRhythm:false,parts:{'Violin I':{strategy:'whole',octaves:12}}},
 generatedScore:{'Violin I':[{pitch:55,start:0,duration:1},{pitch:59,start:1,duration:1}]}
});
assert.deepEqual(adaptive.score.value['Violin I'].map(n=>n.pitch),[67,71]);
adaptive.selectScoreNote(adaptive.score.value['Violin I'][0]);
adaptive.applyQuickNote('1');
assert.deepEqual(adaptive.quickDisplayScore.value['Violin I'].map(n=>n.pitch),[68,71]);
adaptive.commitQuickDraft();
assert.deepEqual(adaptive.project.value.generatedScore['Violin I'].map(n=>n.pitch),[56,59]);
assert.deepEqual(adaptive.score.value['Violin I'].map(n=>n.pitch),[68,71]);
const displayed=adaptive.score.value['Violin I'][0];
adaptive.commitInspectedNote(displayed,{...displayed,pitch:69,approachSlideFrom:68});
assert.deepEqual(adaptive.project.value.generatedScore['Violin I'].map(n=>n.pitch),[57,59]);
assert.equal(adaptive.project.value.generatedScore['Violin I'][0].approachSlideFrom,56);
assert.equal(adaptive.selectedEvent.value.editId,displayed.editId);
adaptive.applyQuickNote('1');
assert.throws(()=>adaptive.commitInspectedNote(adaptive.selectedEvent.value,{...adaptive.selectedEvent.value,velocity:90}),/cancel the current preview/);
adaptive.deleteSelectedNote();
assert.equal(adaptive.project.value.generatedScore['Violin I'].length,2);
adaptive.quickDraft.value=null;
adaptive.deleteSelectedNote();
assert.deepEqual(adaptive.project.value.generatedScore['Violin I'].map(n=>n.pitch),[59]);
adaptive.clearNoteMeasure();
assert.deepEqual(adaptive.project.value.generatedScore['Violin I'],[]);
assert.equal(adaptive.project.value.protectedBars['Violin I:0'],true);
assert.match(app,/:score="quickDisplayScore"/);
assert.match(app,/for\(const note of quickDisplayScore\.value\[noteInst\.value\]/);

(async()=>{
 const backup=await exportProjectZip(draft.project);
 const restored=await loadProject({arrayBuffer:()=>backup.arrayBuffer()});
 assert.deepEqual(restored.generatedScore['Violin I'],draft.score['Violin I']);
 assert.deepEqual(restored.protectedBars,draft.project.protectedBars);
 assert.deepEqual(restored.partEditions['Violin I'].easy,fixture.partEditions['Violin I'].easy);
 const grandStaffBackup=await exportProjectZip(grandStaffEdit.project);
 const restoredGrandStaff=await loadProject({arrayBuffer:()=>grandStaffBackup.arrayBuffer()});
 assert.deepEqual(restoredGrandStaff.generatedScore.Piano,JSON.parse(JSON.stringify([grandStaffNote])));
 console.log('PASS shared musical edit selection, collisions, preview isolation, roles, protected rests and portable round trip');
})().catch(error=>{console.error(error);process.exitCode=1;});
