import {instrumentRange,noteSoundingDuration,type Instrument,type Note,type Project} from './music';
import {effectiveBassTechnique,effectiveViolinTechnique,phraseMeasureMap,plannedArticulation} from './phrasePlan';
import {resolveStringTechnique} from './pizzicatoSamples';
import {passageFingerings,type PassageFingering,type PositionInstrument} from './stringPositionGuide';
import {soundingSeconds} from './tempoExpressions';

type PassageFrame={start:number;end:number;notes:Note[]};
type Plan={assignments:Map<Note,Partial<Note>>;warnings:string[]};
type PositionPlan={fingerings:PassageFingering[];first:number;cost:number;previous:number};
type FingeringPriority='shifts'|'crossings';

function passageFrames(notes:readonly Note[],includeHeld=false):PassageFrame[]{
 const frames:PassageFrame[]=[];
 for(const note of [...notes].sort((a,b)=>a.start-b.start||a.pitch-b.pitch)){
  const end=note.start+note.duration,last=frames.at(-1);
  if(last&&Math.abs(note.start-last.start)<1e-7){last.notes.push(note);last.end=Math.max(last.end,end);}
  else frames.push({start:note.start,end,notes:[note]});
 }
 if(includeHeld){
  let held:Note[]=[];
  for(const frame of frames){
   frame.notes=[...held.filter(note=>note.start+note.duration>frame.start+1e-7),...frame.notes].sort((a,b)=>a.pitch-b.pitch);
   frame.end=Math.max(...frame.notes.map(note=>note.start+note.duration));
   held=frame.notes;
  }
 }
 return frames;
}

function fingeringOptions(family:PositionInstrument,frame:PassageFrame,pitches:ReadonlyMap<Note,number>):PassageFingering[][]{
 if(frame.notes.length>2)return [];
 const [low,high]=instrumentRange(family);
 const [left,right]=frame.notes.map(note=>{
  const pitch=pitches.get(note)??note.pitch;
  return pitch>=low&&pitch<=high?passageFingerings(family,{...note,pitch}):[];
 });
 if(!right)return left.map(finger=>[finger]);
 return left.flatMap(a=>right.filter(b=>a.ordinal===b.ordinal&&Math.abs(a.stringIndex-b.stringIndex)===1&&
  (a.finger==='0'||a.finger!==b.finger||a.offset===b.offset)).map(b=>[a,b]));
}

const followsTie=(prior:Note,note:Note)=>note.xmlTieContinuation&&prior.pitch===note.pitch&&
 (prior.xmlStaff??1)===(note.xmlStaff??1)&&(prior.xmlVoice??'1')===(note.xmlVoice??'1')&&Math.abs(prior.start+prior.duration-note.start)<1e-7;

function fingeringTransition(before:PassageFrame,after:PassageFrame,old:PositionPlan,next:PassageFingering[]):number{
 const shift=Math.abs(old.first-next[0].first);
 for(const [index,note] of before.notes.entries()){
  const prior=old.fingerings[index],end=note.start+note.duration;
  if(end<=after.start+1e-7)continue;
  const held=next[after.notes.indexOf(note)];
  if(!held||held.openMidi!==prior.openMidi||held.finger!==prior.finger||(shift&&prior.finger!=='0'))return Infinity;
 }
 for(const [index,note] of after.notes.entries()){
  if(!note.xmlTieContinuation)continue;
  const from=before.notes.findIndex(prior=>followsTie(prior,note));
  if(from>=0&&(old.fingerings[from].openMidi!==next[index].openMidi||old.fingerings[from].finger!==next[index].finger))return Infinity;
 }
 return Math.abs(old.fingerings[0].stringIndex-next[0].stringIndex);
}

export function planPassageFingering(project:Project,family:PositionInstrument,notes:readonly Note[],pitches:ReadonlyMap<Note,number>,priority:FingeringPriority):Plan{
 const frames=passageFrames(notes,true),layers:PositionPlan[][]=[];
 const result:Plan={assignments:new Map(),warnings:[]};
 const unplayable=new Set<Note>();
 const phrases=phraseMeasureMap(project),beats=project.beats;
 for(const [index,frame] of frames.entries()){
  const bar=Math.floor(frame.start/beats),previous=frames[index-1];
  const prior=layers[index-1]??[];
  const gap=previous?Math.max(0,frame.start-previous.end):0;
  const pause=previous?soundingSeconds(project,previous.end,gap):0;
  const phraseStart=previous&&phrases[Math.floor(previous.start/beats)]!==phrases[bar];
  const shiftWeight=(priority==='shifts'?4:2.2)/(1+pause*6+(phraseStart?1.5:0));
  const crossWeight=(priority==='crossings'?5:1.5)*(frame.notes.some(n=>n.articulation==='legato')?1.5:1);
  const options=fingeringOptions(family,frame,pitches);
  const states:PositionPlan[]=options.flatMap(fingerings=>{
   const first=fingerings[0].first;
   const local=fingerings.reduce((sum,f)=>sum+(f.thumb?2:0)+f.ordinal*.34+(f.finger==='0'?0:Math.max(0,Math.abs(f.offset-f.first)-2)*.8),0);
   if(!prior.length)return [{fingerings,first,cost:local,previous:-1}];
   let cost=Infinity,previousIndex=-1;
   for(const [k,old] of prior.entries()){
    const crossings=fingeringTransition(previous,frame,old,fingerings);
    const shift=Math.abs(first-old.first);
    const next=old.cost+local+shift*shiftWeight+crossings*crossWeight;
    if(next<cost){cost=next;previousIndex=k;}
   }
   return Number.isFinite(cost)?[{fingerings,first,cost,previous:previousIndex}]:[];
  });
  if(!states.length){
   for(const note of frame.notes)unplayable.add(note);
   result.warnings.push(`No compatible fingering in measure ${bar+1}, beat ${Number((frame.start-bar*beats+1).toFixed(2))}`);
  }
  layers.push(states);
 }
 for(let i=layers.length-1;i>=0;){
  const layer=layers[i];
  if(!layer.length){i--;continue;}
  let k=layer.reduce((best,item,index)=>item.cost<layer[best].cost?index:best,0);
  while(i>=0&&k>=0&&layers[i][k]){
   const state:PositionPlan=layers[i][k];
   frames[i].notes.forEach((note,j)=>{
    if(unplayable.has(note))return;
    const fingering=state.fingerings[j];
    const position=fingering.finger==='0'?note.handPosition:fingering.position;
    if(note.finger!==fingering.finger||note.stringMidi!==fingering.openMidi||note.handPosition!==position)
     result.assignments.set(note,{finger:fingering.finger,stringMidi:fingering.openMidi,handPosition:position});
   });
   k=state.previous;i--;
  }
 }
 return result;
}

type Bow='up'|'down';
const opposite=(bow:Bow):Bow=>bow==='up'?'down':'up';

export function planPassageBowing(project:Project,instrument:Instrument,notes:readonly Note[],openingBow:Bow):Plan{
 const result:Plan={assignments:new Map(),warnings:[]};
 const frames=passageFrames(notes),phrases=phraseMeasureMap(project),beats=project.beats;
 let previous:{direction:Bow;end:number;usedSeconds:number;phrase:typeof phrases[number];notes:Note[]}|undefined;
 for(const frame of frames){
  const bar=Math.floor(frame.start/beats),phrase=phrases[bar];
  const inherited=instrument.startsWith('Contrabass')?effectiveBassTechnique(project,instrument,bar,phrase):effectiveViolinTechnique(project,instrument,bar,phrase);
  const bassPizzicato=instrument.startsWith('Contrabass')&&['pizzicato','walking','habanera'].includes(inherited);
  const bowed=frame.notes.filter(note=>{
   const expression=Boolean(note.gesture||note.stringGlissando||note.bowedTremolo||note.slideTo!==undefined||note.approachSlideFrom!==undefined);
   const playing=resolveStringTechnique(instrument,note.technique,inherited,expression)??(bassPizzicato?'pizzicato':'arco');
   return playing!=='pizzicato';
  });
  if(!bowed.length){previous=undefined;continue;}
  const locked=new Set(bowed.flatMap(note=>note.bowDirection?[note.bowDirection]:[]));
  const tied=previous&&bowed.some(note=>previous!.notes.some(prior=>followsTie(prior,note)));
  const lock=[...locked][0];
  if(locked.size>1||(tied&&lock&&lock!==previous!.direction)){
   result.warnings.push(`Conflicting locked bows in measure ${bar+1}`);previous=undefined;continue;
  }
  const seconds=soundingSeconds(project,frame.start,Math.max(...bowed.map(noteSoundingDuration)));
  const legato=bowed.every(note=>(note.articulation??plannedArticulation(project,instrument,bar,phrase))==='legato');
  const accent=bowed.some(note=>note.accent||note.articulation==='marcato_staccato');
  const limit=bowed.some(note=>(note.velocity??80)>=100)?2:3;
  const continuous=previous&&frame.start<=previous.end+.01&&previous.phrase===phrase;
  const carry=previous&&continuous&&legato&&!accent&&previous.usedSeconds+seconds<=limit;
  const direction:Bow=lock??((tied||carry)&&previous?previous.direction:accent?'down':continuous&&previous?opposite(previous.direction):openingBow);
  const usedSeconds=previous&&(tied||(carry&&direction===previous.direction))?previous.usedSeconds+seconds:seconds;
  if(usedSeconds>limit+1e-7)result.warnings.push(`Long bow in measure ${bar+1} may need a bow change or retake`);
  for(const note of bowed)if(!note.bowDirection)result.assignments.set(note,{bowDirection:direction});
  previous={direction,end:Math.max(...bowed.map(note=>note.start+note.duration)),usedSeconds,phrase,notes:bowed};
 }
 return result;
}
