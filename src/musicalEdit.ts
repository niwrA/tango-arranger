import {chordAt,chordTones,keyPitchClasses,noteEditorContext,instrumentRange,instrumentFamily,replaceInstrumentMeasure,suggestedEditorNote,generate,DYNAMIC_VELOCITIES,type Project,type Score,type Note,type Instrument,type Role,type DynamicMark} from './music';
import {RHYTHM_PRESETS,rhythmSlots,retimeMeasure,type RhythmPreset} from './rhythmEditor';
import {GESTURE_PRESETS,createTangoGesture,transposeTangoGesture,type GesturePreset} from './tangoGestures';
export type EditCategory='pitch'|'duration'|'rhythm'|'expression'|'dynamics'|'articulation'|'finger'|'bow'|'position'|'timing'|'structure'|'role'|'create';
export type EditAction={value:string;label:string;title:string};
export type EditSelection={kind:'notes';keys:readonly string[]}|{kind:'measures';from:number;to:number};
export type MusicalEditContext={project:Project;score:Score;instrument:Instrument;selection:EditSelection;duration?:number;role?:Role;replaceExisting?:boolean;entry?:{bar:number;beat:number;pitch:number}};
export type MusicalEditResult={project:Project;score:Score;keys:string[];count:number;description:string};
export const editNoteKey=(n:Note)=>n.start+':'+n.pitch;
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
 case 'structure':return [action('delete','Delete'),action('split','Split'),action('repeat','Repeat')];
 case 'role':return roles.map(v=>action(v,v));
 case 'create':return [action('generate','Fill empty measures'),action('replace','Replace with role'),action('insert','Insert note')];
 }
}
function clearExpression(n:Note){delete n.gesture;delete n.slideTo;delete n.approachSlideFrom;delete n.stringGlissando;delete n.bowedTremolo;delete n.pianoGlissando;delete n.vibrato;delete n.swellTo;}
export function executeMusicalEdit(ctx:MusicalEditContext,category:EditCategory,value:string):MusicalEditResult{
 const {project:p,score, instrument:inst,selection}=ctx,notes=score[inst]??[],beats=p.beats,total=p.bars.length*beats;
 const barOf=(n:Note)=>Math.floor((n.start+1e-7)/beats);
 const chosen=notes.filter(n=>selection.kind==='measures'?barOf(n)>=selection.from&&barOf(n)<=selection.to:selection.keys.includes(editNoteKey(n)));
 const selected=new Set(chosen);
 const bars=new Set(selection.kind==='measures'?Array.from({length:selection.to-selection.from+1},(_,i)=>selection.from+i):chosen.map(barOf));
 let next:Project={...p},result:Note[]=[],kept:Note[]=notes.filter(n=>!selected.has(n));
 const range=instrumentRange(inst);
 const bound=(pitch:number)=>Math.max(range[0],Math.min(range[1],pitch));
 const nearest=(pitch:number,pcs:number[])=>Array.from({length:range[1]-range[0]+1},(_,i)=>i+range[0]).filter(n=>pcs.includes(n%12)).sort((a,b)=>Math.abs(a-pitch)-Math.abs(b-pitch)||a-b)[0]??pitch;
 const sorted=[...chosen].sort((a,b)=>a.start-b.start||a.pitch-b.pitch);
 if(category==='create'&&value==='insert'){
  if(!ctx.entry)throw Error('Choose a pitch and onset first');
  const {bar,beat,pitch}=ctx.entry;bars.clear();bars.add(bar);kept=[...notes];
  if(notes.some(n=>n.pitch===pitch&&Math.abs(n.start-bar*beats-beat)<1e-6))throw Error('A note already exists at that onset and pitch');
  const defaults=ctx.role?{...p,measureRoles:{...p.measureRoles,[inst+':'+bar]:ctx.role}}:p;
  result=[suggestedEditorNote(defaults,inst,bar,beat,pitch,ctx.duration)];
 }else if(category==='create'&&(value==='generate'||value==='replace')||category==='role'){
  if(!bars.size)throw Error('Select a measure range');
  if(category==='create'&&value==='generate')for(const b of [...bars])if(notes.some(n=>barOf(n)===b))bars.delete(b);
  if(!bars.size)throw Error('All selected measures already contain notes; use Replace with role explicitly');
  const overrides={...p.measureRoles};
  for(const b of bars)if(category==='role'||ctx.role)overrides[inst+':'+b]=(category==='role'?value:ctx.role) as Role;
  const temporary={...p,measureRoles:overrides,protectedBars:{...p.protectedBars}};
  for(const b of bars)delete temporary.protectedBars[inst+':'+b];
  const fresh=generate(temporary)[inst]??[];
  kept=notes.filter(n=>!bars.has(barOf(n)));
  result=fresh.filter(n=>bars.has(barOf(n)));
  if(category==='role'){kept=notes.filter(n=>!bars.has(barOf(n)));result=notes.filter(n=>bars.has(barOf(n)));}
  if(category==='role')next={...next,measureRoles:overrides};
 }else if(category==='rhythm'){
  if(!chosen.length)throw Error('Select notes or measures containing notes');
  for(const b of bars)result.push(...retimeMeasure(chosen,inst,b,beats,rhythmSlots(value as RhythmPreset,beats,inst,p.profile),'rhythm',p.pianoSplitPitch??60,undefined,value as RhythmPreset));
 }else{
  if(!chosen.length)throw Error('Select notes first');
  for(const [index,original] of sorted.entries()){
   const n={...original},bar=barOf(n);
   if(category==='pitch'){
    const chord=chordAt(p.bars[bar].chord,beats,n.start-bar*beats);
    const target=value==='chord'?(chord?nearest(n.pitch,chordTones(chord)):n.pitch):value==='key'?nearest(n.pitch,keyPitchClasses(noteEditorContext(p,inst,bar).key)):bound(n.pitch+Number(value));
    const delta=target-n.pitch;n.pitch=target;
    if(delta){delete n.stringMidi;delete n.finger;delete n.handPosition;if(n.gesture)n.gesture=transposeTangoGesture(n.gesture,delta);if(n.slideTo!==undefined)n.slideTo+=delta;if(n.approachSlideFrom!==undefined)n.approachSlideFrom+=delta;}
   }else if(category==='duration'){
    n.duration=Math.min(total-n.start,value==='dot'?n.duration*1.5:value==='triplet'?n.duration*2/3:value==='double'?n.duration*2:value==='half'?n.duration/2:Number(value));delete n.rhythmSource;
   }else if(category==='timing'){
    if(value==='short'||value==='full')n.gate=value==='short'?.5:1;
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
    if(value==='split'||value==='repeat'){
     const length=n.duration/2;n.duration=length;delete n.rhythmSource;
     const tail={...n,start:n.start+length};clearExpression(tail);delete tail.lyric;delete tail.lyric2;result.push(tail);
    }
   }
   result.push(n);
  }
 }
 for(const n of result)bars.add(barOf(n));
 const combined=[...kept,...result];
 let current=score;
 for(const bar of [...bars].sort((a,b)=>a-b)){
  next=replaceInstrumentMeasure(next,current,inst,bar,combined.filter(n=>barOf(n)===bar));current=next.generatedScore!;
 }
 return {project:next,score:current,keys:result.map(editNoteKey),count:result.length,description:category+' · '+value+' · '+bars.size+' measure(s)'};
}
