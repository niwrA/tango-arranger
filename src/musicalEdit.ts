import {chordAt,chordTones,keyPitchClasses,noteEditorContext,writtenInstrumentRange,writtenInstrumentPitchPlayable,instrumentFamily,replaceInstrumentMeasure,suggestedEditorNote,generate,combineNoteAttacks,DYNAMIC_VELOCITIES,type Project,type Score,type Note,type Instrument,type Role,type DynamicMark} from './music';
import {RHYTHM_PRESETS,rhythmSlots,retimeMeasure,type RhythmPreset} from './rhythmEditor';
import {GESTURE_PRESETS,createTangoGesture,transposeTangoGesture,type GesturePreset} from './tangoGestures';
import {createPhrasePlan,phraseAt} from './phrasePlan';
import {clearRhythmSourceIfRetimed,nearestRhythmSlot,snapNoteToPreset} from './rhythmSnap';
import {composeMusicalBrush,instrumentBrushes,type MusicalBrush} from './musicalBrush';
export type EditCategory='pitch'|'duration'|'rhythm'|'expression'|'dynamics'|'articulation'|'finger'|'bow'|'position'|'timing'|'structure'|'role'|'create';
export type EditAction={value:string;label:string;title:string};
export type EditSelection=
 |{kind:'notes';keys:readonly string[]}
 |{kind:'measures';from:number;to:number}
 |{kind:'range';fromBeat:number;toBeat:number}
 |{kind:'phrase';measure:number}
 |{kind:'part'};
export type NoteNotationEdit={staff?:1|2;octaveShift:number};
export type NoteGeometryEdit={start:number;duration:number;pitchDelta:number;notation?:NoteNotationEdit};
export type NoteEntryEdit={bar:number;beat:number;pitch:number;notation?:NoteNotationEdit;articulation?:Note['articulation'];rhythm?:{preset:RhythmPreset;originalBeat:number;accent:boolean}};
export type MusicalEditContext={project:Project;score:Score;instrument:Instrument;selection:EditSelection;duration?:number;role?:Role;entry?:NoteEntryEdit;geometry?:NoteGeometryEdit;details?:{before:Note;after:Note};snapPreset?:RhythmPreset;brush?:MusicalBrush};
export type MusicalEditChanges={added:Note[];modified:{before:Note;after:Note}[];deleted:Note[]};
export type MusicalEditResult={project:Project;score:Score;keys:string[];count:number;description:string;affectedMeasures:number[];warnings:string[];changes:MusicalEditChanges};
const onsetPitchKey=(n:Note)=>n.start+':'+n.pitch;
export const editNoteKey=(n:Note)=>n.editId?`id:${n.editId}`:onsetPitchKey(n);

function applyNoteNotation(note:Note,notation:NoteNotationEdit|undefined){
 if(!notation)return;
 if(notation.staff){note.staffOverride=notation.staff;note.xmlStaff=notation.staff;}
 if(notation.octaveShift)note.xmlOctaveShift=notation.octaveShift;else delete note.xmlOctaveShift;
}

/** Legacy notes can share the same onset and pitch, or a copied note ID.
 * Disambiguate within the part until an edit gives that note its own ID. */
export function editPartNoteKeys(notes:readonly Note[],displayed=notes):ReadonlyMap<Note,string>{
 if(notes.length!==displayed.length)throw Error('The displayed part does not match the written part');
 const counts=new Map<string,number>();
 for(const note of notes){const key=editNoteKey(note);counts.set(key,(counts.get(key)??0)+1);}
 const occurrences=new Map<string,number>();
 return new Map(notes.map((note,index)=>{
  const key=editNoteKey(note);
  if(counts.get(key)===1)return [displayed[index],key];
  const occurrence=occurrences.get(key)??0;
  occurrences.set(key,occurrence+1);
  return [displayed[index],`duplicate:${occurrence}:${key}`];
 }));
}
const action=(value:string,label:string,title=label):EditAction=>({value,label,title});
const roles:Role[]=['melody','harmony','chords','bass','fill','variation','rest'];
export const editCategories:{id:EditCategory;label:string}[]=[{id:'pitch',label:'Pitch'},{id:'duration',label:'Note value'},{id:'rhythm',label:'Rhythm'},{id:'expression',label:'Style & expression'},{id:'dynamics',label:'Dynamics'},{id:'articulation',label:'Articulation'},{id:'finger',label:'Fingering'},{id:'bow',label:'Bowing'},{id:'position',label:'Position & string'},{id:'timing',label:'Timing'},{id:'structure',label:'Structure'},{id:'role',label:'Role'},{id:'create',label:'Create'}];
export function musicalEditActions(category:EditCategory,inst:Instrument):EditAction[]{
 const family=instrumentFamily(inst),bowed=family==='Violin'||family==='Contrabass';
 switch(category){
 case 'pitch':return [action('-12','−8va','Octave down'),action('-1','−1','Semitone down'),action('1','+1','Semitone up'),action('12','+8va','Octave up'),action('chord','Chord','Snap to chord'),action('key','Key','Snap to key')];
 case 'duration':return [action('4','𝅝','Whole note'),action('2','𝅗𝅥','Half note'),action('1','♩','Quarter note'),action('.5','♪','Eighth note'),action('.25','♬','Sixteenth note'),action('dot','·','Dotted value'),action('triplet','3','Triplet value'),action('double','×2','Double duration'),action('half','÷2','Halve duration')];
 case 'rhythm':return RHYTHM_PRESETS.map(p=>action(p.id,p.label,p.description));
 case 'expression':return family==='Piano'?[action('clear','Clear expression')]:GESTURE_PRESETS.filter(p=>family==='Violin'||!p.value.startsWith('sirena')).map(p=>action(p.value,p.label)).concat(bowed?[action('tremolo','///','Bowed tremolo'),action('clear','Clear expression')]:[action('clear','Clear expression')]);
 case 'dynamics':return Object.keys(DYNAMIC_VELOCITIES).map(v=>action(v,v)).concat([action('crescendo','<','Crescendo'),action('diminuendo','>','Diminuendo')]);
 case 'articulation':return [action('staccato','•','Staccato'),action('marcato_staccato','>','Accent / marcato'),action('legato','—','Legato'),...(family==='Violin'?[action('vibrato','vib.','Vibrato')]:[]),action('clear','Clear')];
 case 'finger':return bowed?['0','1','2','3','4',...(family==='Contrabass'?['T']:[])].map(v=>action(v,v,'Finger '+v)).concat(action('clear','Auto')):[];
 case 'bow':return bowed?[action('down','𝆪','Down-bow'),action('up','𝆫','Up-bow'),action('alternate','↕','Alternate bows'),action('arco','arco'),action('pizzicato','pizz.'),action('clear','Clear')]:[];
 case 'position':return bowed?['I','II','III','IV','V','VI','VII','VIII','IX'].map(v=>action(v,v,'Hand position '+v)).concat((family==='Violin'?[55,62,69,76]:[28,33,38,43]).map((v,i)=>action('string:'+v,(family==='Violin'?['G','D','A','E']:['E','A','D','G'])[i],'Assign string')),action('clear','Auto')):[];
 case 'timing':return [action('-.25','← ¼','Earlier'),action('.25','¼ →','Later'),action('quantize','Grid','Quantize to quarter beat'),action('short','Short','Shorten sounding length'),action('full','Full','Full sounding length')];
 case 'structure':return [action('delete','Delete'),action('split','Split'),action('repeat','Repeat'),action('merge','Merge','Merge two selected notes'),action('untie','Untie','Remove selected incoming ties')];
 case 'role':return roles.map(v=>action(v,v));
 case 'create':return [action('generate','Fill empty measures'),action('replace','Replace with role'),action('insert','Insert note')];
 }
}
function clearExpression(n:Note){delete n.gesture;delete n.slideTo;delete n.approachSlideFrom;delete n.stringGlissando;delete n.bowedTremolo;delete n.pianoGlissando;delete n.vibrato;delete n.swellTo;}
function movePitch(note:Note,target:number){
 const delta=target-note.pitch;
 if(!delta)return;
 note.pitch=target;
 delete note.stringMidi;
 delete note.finger;
 delete note.handPosition;
 if(note.gesture)note.gesture=transposeTangoGesture(note.gesture,delta);
 if(note.slideTo!==undefined)note.slideTo+=delta;
 if(note.approachSlideFrom!==undefined)note.approachSlideFrom+=delta;
}
function tiePosition(note:Note,beat:number){
 return `${note.xmlStaff??1}:${note.xmlVoice??'1'}:${note.pitch}:${Math.round(beat*1e6)}`;
}
function reconcileTies(
 notes:readonly Note[],kept:readonly Note[],transformed:ReadonlyMap<Note,Note>,
 replacementEnds:ReadonlyMap<Note,Note>,warn:(note:Note)=>void
){
 if(!notes.some(note=>note.xmlTieContinuation))return;
 const originalEnds=new Map<string,Note[]>();
 for(const note of notes){
  const key=tiePosition(note,note.start+note.duration);
  const candidates=originalEnds.get(key)??[];
  candidates.push(note);
  originalEnds.set(key,candidates);
 }
 const retained=new Set(kept);
 for(const original of notes){
  if(!original.xmlTieContinuation)continue;
  const updated=transformed.get(original)??(retained.has(original)?original:undefined);
  if(!updated?.xmlTieContinuation)continue;
  const predecessors=originalEnds.get(tiePosition(original,original.start));
  if(!predecessors?.length)continue;
  const stillTied=predecessors.some(predecessor=>{
   const end=replacementEnds.get(predecessor)??transformed.get(predecessor)??(retained.has(predecessor)?predecessor:undefined);
   return end&&tiePosition(end,end.start+end.duration)===tiePosition(updated,updated.start);
  });
  if(stillTied)continue;
  if(updated===original)throw Error('This edit would break a tie outside the selection. Select the tied notes together or untie the continuation first.');
  delete updated.xmlTieContinuation;
  warn(updated);
 }
}
/** Ranges are half-open in beats. An attack belongs to the range it starts in. */
export function resolveEditSelection(p:Project,notes:readonly Note[],selection:EditSelection,rejectStale=true){
 const measureOf=(start:number)=>Math.floor((start+1e-7)/p.beats);
 if(selection.kind==='notes'){
  const keys=new Set(selection.keys);
  const partKeys=editPartNoteKeys(notes);
  const chosen=notes.filter(note=>keys.has(partKeys.get(note)!));
  if(rejectStale&&chosen.length!==keys.size)throw Error('Note selection is stale or ambiguous');
  return {notes:chosen,measures:[...new Set(chosen.map(note=>measureOf(note.start)))]};
 }
 let from=0,to=p.bars.length-1;
 let fromBeat=0,toBeat=p.bars.length*p.beats;
 if(selection.kind==='range'){
  ({fromBeat,toBeat}=selection);
  if(!Number.isFinite(fromBeat)||!Number.isFinite(toBeat)||fromBeat<0||toBeat>p.bars.length*p.beats||fromBeat>=toBeat)
   throw Error('Beat range is outside the song');
  from=Math.floor(fromBeat/p.beats);
  to=Math.ceil(toBeat/p.beats)-1;
 }else{
  if(selection.kind==='measures')({from,to}=selection);
  if(selection.kind==='phrase'){
   if(!Number.isInteger(selection.measure)||selection.measure<0||selection.measure>=p.bars.length)
    throw Error('Phrase selection is outside the song');
   const phrase=phraseAt(p,selection.measure)??createPhrasePlan(p,p.articulation?.phraseBars??8).phrases.find(item=>item.startMeasure<=selection.measure&&item.endMeasure>=selection.measure);
   if(!phrase)throw Error('Phrase selection is outside the song');
   from=phrase.startMeasure;
   to=phrase.endMeasure;
  }
  if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<from||to>=p.bars.length)
   throw Error('Measure selection is outside the song');
  fromBeat=from*p.beats;
  toBeat=(to+1)*p.beats;
 }
 return {notes:notes.filter(note=>note.start>=fromBeat&&note.start<toBeat),measures:Array.from({length:to-from+1},(_,i)=>from+i)};
}
export function executeMusicalEdit(ctx:MusicalEditContext,category:EditCategory,value:string):MusicalEditResult{
 const {project:p,score, instrument:inst,selection}=ctx,notes=score[inst]??[],beats=p.beats,total=p.bars.length*beats;
 const geometry=category==='timing'&&value==='geometry';
 const inspector=category==='structure'&&value==='inspector';
 const clearMeasure=category==='structure'&&value==='clear-measure';
 const snap=category==='rhythm'&&value==='snap-onset';
 const brush=category==='create'&&value==='brush';
 if(!geometry&&!inspector&&!clearMeasure&&!snap&&!brush&&!musicalEditActions(category,inst).some(action=>action.value===value))throw Error('Unsupported edit for this instrument');
 if(selection.kind==='range'&&(category==='role'||category==='rhythm'||category==='create'&&value!=='insert'&&!brush))
  throw Error('Choose whole measures for this edit');
 const barOf=(n:Note)=>Math.floor((n.start+1e-7)/beats);
 const {notes:chosen,measures}=resolveEditSelection(p,notes,selection);
 if(geometry&&(!ctx.geometry||selection.kind!=='notes'||chosen.length!==1))throw Error('Choose one note to move or resize');
 if(inspector&&(!ctx.details||selection.kind!=='notes'||chosen.length!==1))throw Error('Choose one note to edit');
 if(clearMeasure&&(selection.kind!=='measures'||selection.from!==selection.to))throw Error('Choose one measure to clear');
 const selected=new Set(chosen);
 const bars=new Set(measures);
 if(category!=='create'&&category!=='role'&&!clearMeasure){
  // Empty measures inside a selection do not become protected edits.
  const activeBars=new Set(chosen.map(barOf));
  for(const bar of bars)if(!activeBars.has(bar))bars.delete(bar);
 }
 const warnings:string[]=[];
 const transformed=new Map<Note,Note>();
 const replacementEnds=new Map<Note,Note>();
 let next:Project={...p},result:Note[]=[],kept:Note[]=notes.filter(n=>!selected.has(n));
 const range=writtenInstrumentRange(inst,p);
 const playable=(pitch:number)=>writtenInstrumentPitchPlayable(inst,pitch,p);
 const nearest=(pitch:number,pcs:number[])=>Array.from({length:range[1]-range[0]+1},(_,i)=>i+range[0]).filter(n=>pcs.includes(n%12)&&playable(n)).sort((a,b)=>Math.abs(a-pitch)-Math.abs(b-pitch)||a-b)[0]??pitch;
 const bound=(pitch:number)=>Math.max(range[0],Math.min(range[1],pitch));
 const sorted=[...chosen].sort((a,b)=>a.start-b.start||a.pitch-b.pitch);
 if(brush){
  const input=ctx.brush;
  if(!input||selection.kind!=='range'||!instrumentBrushes(inst).some(item=>item.id===input.kind))throw Error('Choose a compatible brush and beat range');
  if(!RHYTHM_PRESETS.some(preset=>preset.id===input.rhythm))throw Error('Choose a valid brush rhythm');
  const {fromBeat,toBeat}=selection;
  const stroke=input.stroke;
  if(stroke.fromBeat!==fromBeat||stroke.toBeat!==toBeat||!Number.isInteger(input.referencePitch)||input.referencePitch<0||input.referencePitch>127||
   stroke.points.some((point,index)=>!Number.isFinite(point.beat)||point.beat<fromBeat||point.beat>=toBeat||
    (index>0&&stroke.points[index-1].beat>=point.beat)||!Number.isInteger(point.pitch)||point.pitch<0||point.pitch>127))throw Error('Invalid brush stroke');
  const blocked=new Set(measures.filter(bar=>p.protectedBars?.[`${inst}:${bar}`]||notes.some(note=>barOf(note)===bar&&(note.source==='manual'||note.source==='imported'))));
  const replaceable=new Set(input.replace?chosen.filter(note=>!blocked.has(barOf(note))&&note.start+note.duration<=toBeat+1e-7):[]);
  const retained=notes.filter(note=>!replaceable.has(note));
  const overlaps=new Set<number>();
  const candidates=composeMusicalBrush(p,inst,notes,input,ctx.role).filter(note=>!blocked.has(barOf(note)));
  result=candidates.filter(note=>{
   if(retained.some(original=>original.start<note.start+note.duration-1e-7&&original.start+original.duration>note.start+1e-7)){
    overlaps.add(barOf(note));return false;
   }
   return true;
  });
  for(const bar of blocked)warnings.push('Skipped protected material in measure '+(bar+1));
  for(const bar of overlaps)warnings.push('Skipped occupied beats in measure '+(bar+1));
  if(!result.length)throw Error(warnings.join('. ')||'The brush found no compatible attacks in this range');
  bars.clear();for(const note of result)bars.add(barOf(note));
  kept=notes.filter(note=>!replaceable.has(note)||!bars.has(barOf(note)));
 }else if(category==='create'&&value==='insert'){
  if(!ctx.entry)throw Error('Choose a pitch and onset first');
  const {bar,beat,pitch,articulation,rhythm,notation}=ctx.entry;bars.clear();bars.add(bar);kept=[...notes];
  if(!Number.isInteger(bar)||!p.bars[bar]||!Number.isFinite(beat)||beat<0||beat>=beats||!playable(pitch))
   throw Error('Note entry is outside the measure or instrument range');
  if(notes.some(n=>n.pitch===pitch&&Math.abs(n.start-bar*beats-beat)<1e-6))throw Error('A note already exists at that onset and pitch');
  const defaults=ctx.role?{...p,measureRoles:{...p.measureRoles,[inst+':'+bar]:ctx.role}}:p;
  const added=suggestedEditorNote(defaults,inst,bar,beat,pitch,ctx.duration);
  applyNoteNotation(added,notation);
  if(articulation){added.articulation=articulation;added.accent=articulation==='marcato_staccato';delete added.gate;}
  if(rhythm)added.rhythmSource={kind:'preset',...rhythm,targetBeat:beat,targetDuration:added.duration};
  result=[added];
 }else if(category==='create'&&(value==='generate'||value==='replace')||category==='role'){
  if(!bars.size)throw Error('Select a measure range');
  const overrides={...p.measureRoles};
  if(category==='role'){
   for(const b of bars)overrides[inst+':'+b]=value as Role;
   const partKeys=editPartNoteKeys(notes);
   return {project:{...p,generatedScore:p.generatedScore??score,measureRoles:overrides},score,keys:chosen.map(note=>partKeys.get(note)!),count:chosen.length,description:'Changed role in '+bars.size+' measure(s)',affectedMeasures:[...bars],warnings,changes:{added:[],modified:[],deleted:[]}};
  }
  if(value==='generate'){
   for(const b of bars)if(p.protectedBars[inst+':'+b]||notes.some(n=>n.start<(b+1)*beats&&n.start+n.duration>b*beats)){
    bars.delete(b);
    warnings.push('Skipped occupied or protected measure '+(b+1));
   }
   if(!bars.size)throw Error('Selected measures already contain notes or are protected');
  }
  for(const b of bars)if(ctx.role)overrides[inst+':'+b]=ctx.role;
  const temporary={...p,measureRoles:overrides,protectedBars:{...p.protectedBars}};
  for(const b of bars)delete temporary.protectedBars[inst+':'+b];
  const fresh=generate(temporary)[inst]??[];
  kept=notes.filter(n=>!bars.has(barOf(n)));
  result=fresh.filter(n=>bars.has(barOf(n)));
 }else if(snap){
  const first=chosen[0],preset=ctx.snapPreset;
  if(!first||!preset||!chosen.every(note=>Math.abs(note.start-first.start)<1e-6))throw Error('Select one onset and a rhythm preset');
  if(!nearestRhythmSlot(first.start-barOf(first)*beats,preset,beats,inst,p.profile,0.5))
   throw Error('No rhythm-preset onset within half a beat');
  for(const note of chosen){
   const updated={...snapNoteToPreset(note,beats,inst,p.profile,preset,0.5)};
   transformed.set(note,updated);
   result.push(updated);
  }
 }else if(category==='rhythm'){
  if(!chosen.length)throw Error('Select notes or measures containing notes');
  for(const b of bars)result.push(...retimeMeasure(chosen,inst,b,beats,rhythmSlots(value as RhythmPreset,beats,inst,p.profile),'rhythm',p.pianoSplitPitch??60,undefined,value as RhythmPreset));
  for(const note of result)delete note.xmlTieContinuation;
 }else if(inspector){
  const original=chosen[0],{before,after}=ctx.details!;
  // Register adaptation changes the displayed pitch and absolute gesture endpoints.
  const displayOffset=before.pitch-original.pitch;
  if(before.start!==original.start||before.duration!==original.duration)throw Error('The inspected note changed');
  const edited:Note={...after,editId:original.editId,source:original.source,xmlTieContinuation:original.xmlTieContinuation,
   pitch:after.pitch-displayOffset,
   slideTo:after.slideTo===undefined?undefined:after.slideTo-displayOffset,
   approachSlideFrom:after.approachSlideFrom===undefined?undefined:after.approachSlideFrom-displayOffset,
   gesture:after.gesture&&displayOffset?transposeTangoGesture(after.gesture,-displayOffset):after.gesture};
  if(edited.velocity!==undefined&&(!Number.isInteger(edited.velocity)||edited.velocity<1||edited.velocity>127))throw Error('Velocity must be 1–127');
  const updated=clearRhythmSourceIfRetimed(original,edited,beats);
  transformed.set(original,updated);
  result.push(updated);
 }else if(category==='structure'&&value==='merge'){
  if(sorted.length!==2)throw Error('Select exactly two notes to merge');
  const merged=combineNoteAttacks(sorted[0],sorted[1]);
  transformed.set(sorted[0],merged);
  replacementEnds.set(sorted[1],merged);
  result.push(merged);
 }else if(!clearMeasure){
  if(!chosen.length)throw Error('Select notes first');
  if(category==='structure'&&value==='untie'&&!chosen.some(note=>note.xmlTieContinuation))throw Error('Select a tied continuation');
  for(const [index,original] of sorted.entries()){
   let n={...original};
   const bar=barOf(n);
   if(category==='pitch'){
    const chord=chordAt(p.bars[bar].chord,beats,n.start-bar*beats);
    const target=value==='chord'?(chord?nearest(n.pitch,chordTones(chord)):n.pitch):value==='key'?nearest(n.pitch,keyPitchClasses(noteEditorContext(p,inst,bar).key)):bound(n.pitch+Number(value));
    movePitch(n,target);
   }else if(category==='duration'){
    n.duration=Math.min(total-n.start,value==='dot'?n.duration*1.5:value==='triplet'?n.duration*2/3:value==='double'?n.duration*2:value==='half'?n.duration/2:Number(value));delete n.rhythmSource;
   }else if(category==='timing'){
    if(geometry){
     const {start,duration,pitchDelta,notation}=ctx.geometry!;
     const pitch=n.pitch+pitchDelta;
     if(!Number.isFinite(start)||!Number.isFinite(duration)||start<0||duration<=0||start+duration>total+1e-8||!playable(pitch))
      throw Error('Note would leave the song or instrument range');
     movePitch(n,pitch);
     n.start=start;n.duration=duration;
     applyNoteNotation(n,notation);
     n=clearRhythmSourceIfRetimed(original,n,beats);
    }else if(value==='short'||value==='full')n.gate=value==='short'?.5:1;
    else{n.start=Math.max(0,Math.min(total-n.duration,value==='quantize'?Math.round(n.start*4)/4:n.start+Number(value)));delete n.rhythmSource;}
   }else if(category==='dynamics'){
    if(value==='crescendo'||value==='diminuendo'){
     const from=value==='crescendo'?52:108,to=value==='crescendo'?108:52;
     n.velocity=Math.round(from+(to-from)*index/Math.max(1,sorted.length-1));
     if(sorted.length===1&&instrumentFamily(inst)!=='Piano'&&n.technique!=='pizzicato')n.swellTo=to;
    }else n.velocity=DYNAMIC_VELOCITIES[value as DynamicMark];
   }else if(category==='expression'){
    clearExpression(n);
    if(value==='tremolo')n.bowedTremolo={strokes:3};
    else if(value!=='clear')n.gesture=createTangoGesture(n,inst,value as GesturePreset,range);
   }else if(category==='articulation'){
    if(value==='vibrato')n.vibrato=true;
    else if(value==='clear'){delete n.articulation;delete n.accent;delete n.vibrato;}
    else{n.articulation=value as Note['articulation'];n.accent=value==='marcato_staccato';delete n.gate;}
   }else if(category==='finger'){if(value==='clear')delete n.finger;else n.finger=value as Note['finger'];}
   else if(category==='position'){
    if(value==='clear'){delete n.stringMidi;delete n.handPosition;delete n.finger;}
    else if(value.startsWith('string:')){const pitch=Number(value.slice(7));if(pitch>n.pitch)throw Error('Selected pitch is below the requested string');n.stringMidi=pitch;delete n.finger;}
    else n.handPosition=value;
   }else if(category==='bow'){
    if(value==='up'||value==='down'||value==='alternate'){n.bowDirection=value==='alternate'?(index%2?'up':'down'):value;n.technique='arco';}
    else if(value==='arco'||value==='pizzicato'){n.technique=value;if(value==='pizzicato'){clearExpression(n);delete n.bowDirection;}}
    else delete n.bowDirection;
   }else if(category==='structure'){
    if(value==='delete')continue;
    if(value==='untie'){
     if(!n.xmlTieContinuation){kept.push(original);continue;}
     delete n.xmlTieContinuation;
    }
    if(value==='split'||value==='repeat'){
     const length=n.duration/2;n.duration=length;delete n.rhythmSource;
     const tail={...n,start:n.start+length};clearExpression(tail);delete tail.editId;delete tail.xmlTieContinuation;delete tail.lyric;delete tail.lyric2;
     replacementEnds.set(original,tail);
     result.push(tail);
    }
   }
   transformed.set(original,n);
   result.push(n);
  }
 }
 if(category==='structure'&&value==='untie'){
  bars.clear();
  for(const note of result)bars.add(barOf(note));
 }
 reconcileTies(notes,kept,transformed,replacementEnds,note=>warnings.push('Removed the separated tie in measure '+(barOf(note)+1)));
 for(const n of result)bars.add(barOf(n));
 const combined=[...kept,...result];
 const countByKey=(part:readonly Note[])=>{
  const counts=new Map<string,number>();
  for(const note of part){const key=onsetPitchKey(note);counts.set(key,(counts.get(key)??0)+1);}
  return counts;
 };
 const originalCounts=countByKey(notes);
 for(const [key,count] of countByKey(combined))
  if(count>Math.max(1,originalCounts.get(key)??0))throw Error('Edit would place multiple notes at the same onset and pitch');
 // Allocate locally and deterministically so direct and preview agree.
 const existingIds=new Set(notes.flatMap(note=>note.editId?[note.editId]:[]));
 const usedIds=new Set(kept.flatMap(note=>note.editId?[note.editId]:[]));
 const nextId=p.nextMusicalEditId??1;
 const firstId=Number.isSafeInteger(nextId)&&nextId>0?nextId:1;
 let serial=firstId;
 for(const note of result){
  if(!note.editId||usedIds.has(note.editId)){
   while(existingIds.has(String(serial)))serial++;
   note.editId=String(serial++);
  }
  usedIds.add(note.editId);
 }
 if(serial!==firstId)next.nextMusicalEditId=serial;
 let current=score;
 const unchanged=new Set(kept);
 for(const bar of [...bars].sort((a,b)=>a-b)){
  next=replaceInstrumentMeasure(next,current,inst,bar,combined.filter(n=>barOf(n)===bar),unchanged);current=next.generatedScore!;
 }
 const affectedMeasures=new Set(bars);
 const removed=notes.filter(note=>!unchanged.has(note));
 for(const note of [...removed,...result]){
  const last=Math.min(p.bars.length-1,Math.floor((note.start+note.duration-1e-8)/beats));
  for(let bar=barOf(note);bar<=last;bar++)affectedMeasures.add(bar);
 }
 const stored=new Map((current[inst]??[]).map(note=>[editNoteKey(note),note]));
 const storedResult=(note:Note)=>stored.get(editNoteKey(note))!;
 const modified=new Set(transformed.values());
 const changes={
  added:result.filter(note=>!modified.has(note)).map(storedResult),
  modified:[...transformed].map(([before,after])=>({before,after:storedResult(after)})),
  deleted:removed.filter(note=>!transformed.has(note))
 };
 const label=geometry?'Move or resize note':inspector?'Edit note':clearMeasure?'Clear measure':snap?'Snap onset to rhythm preset':brush?'Brush '+ctx.brush!.kind:category+' · '+value;
 return {project:next,score:current,keys:result.map(editNoteKey),count:result.length,description:label+' · '+affectedMeasures.size+' measure(s)',affectedMeasures:[...affectedMeasures].sort((a,b)=>a-b),warnings,changes};
}
