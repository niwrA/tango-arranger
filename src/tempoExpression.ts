import type {Project,Instrument} from './music';

export type Ritardando={startMeasure:number;endMeasure:number;endPercent:number;returnToTempo:boolean};
export type FermataMark={measure:number;instrument:Instrument;holdBeats:number;waitForCue:boolean};
export type TempoEvent={beat:number;bpm:number;label?:'rit.'|'a tempo'};
const round=(n:number)=>Math.round(n*1000)/1000;
const clamp=(n:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,n));

/** All coordinates are zero-based and refer to written measures, not seconds.
 * An optional open-ended ritardando retains its ending tempo until a later cue.
 */
export function validateRitardando(p:Project,mark:Ritardando):void{
 if(!Number.isInteger(mark.startMeasure)||!Number.isInteger(mark.endMeasure)||mark.startMeasure<0||
   mark.endMeasure<mark.startMeasure||mark.endMeasure>=p.bars.length)throw Error('Invalid ritardando measure range');
 if(!Number.isFinite(mark.endPercent)||mark.endPercent<30||mark.endPercent>100)
   throw Error('Final tempo must be between 30% and 100%');
 if(typeof mark.returnToTempo!=='boolean')throw Error('Choose whether to resume a tempo');
 const ramps=p.ritardandos??[];
 if(ramps.some(r=>r.startMeasure<=mark.endMeasure&&mark.startMeasure<=r.endMeasure))throw Error('Ritardando ranges cannot overlap');
}
export function validateFermata(p:Project,mark:FermataMark):void{
 if(!Number.isInteger(mark.measure)||mark.measure<0||mark.measure>=p.bars.length)throw Error('Invalid fermata measure');
 if(!p.instruments?.includes(mark.instrument)&&!Object.keys(p.generatedScore??p.roles[p.bars[mark.measure].section]??{}).includes(mark.instrument)&&
    !['Voice','Piano','Contrabass','Violin I','Violin II','Bandoneon I','Bandoneon II'].includes(mark.instrument))
   throw Error('Fermata instrument is not in the orchestra');
 if(!Number.isFinite(mark.holdBeats)||mark.holdBeats<0.5||mark.holdBeats>16)throw Error('Fermata hold must be 0.5–16 additional beats');
 if(typeof mark.waitForCue!=='boolean')throw Error('Choose a timed or conductor-cued hold');
}
export function addRitardando(p:Project,mark:Ritardando):Project{
 validateRitardando(p,mark);
 return {...p,ritardandos:[...(p.ritardandos??[]).map(r=>({...r})),{...mark}].sort((a,b)=>a.startMeasure-b.startMeasure)};
}
export function addFermata(p:Project,mark:FermataMark):Project{
 validateFermata(p,mark);
 return {...p,fermatas:[...(p.fermatas??[]).filter(r=>!(r.measure===mark.measure&&r.instrument===mark.instrument)).map(r=>({...r})),{...mark}].sort((a,b)=>a.measure-b.measure)};
}
/** Playback and exporters share the same beat-level tempo curve. */
export function tempoAtBeat(p:Project,beat:number):number{
 const sorted=[...(p.ritardandos??[])].sort((a,b)=>a.startMeasure-b.startMeasure);
 let percent=100;
 for(const range of sorted){
  const start=range.startMeasure*p.beats,end=(range.endMeasure+1)*p.beats;
  if(beat<start)break;
  if(beat<end){
   const fraction=clamp((beat-start)/Math.max(1e-9,end-start),0,1);
   return round(p.bpm*(percent+(range.endPercent-percent)*fraction)/100);
  }
  percent=range.returnToTempo?100:range.endPercent;
 }
 return round(p.bpm*percent/100);
}
/** Tempo changes sampled at quarter-beat positions. Emit only inside written music.
 * Visible rit. and a tempo are separate from the machine-readable tempo events.
 */
export function tempoEvents(p:Project,step=1):TempoEvent[]{
 const length=p.bars.length*p.beats;
 if(!Number.isFinite(step)||step<=0||step>p.beats)throw Error('Invalid tempo sampling interval');
 const ramps=[...(p.ritardandos??[])].sort((a,b)=>a.startMeasure-b.startMeasure);
 if(!ramps.length)return [];
 const labels=new Map<number,TempoEvent['label']>();
 for(const r of ramps){
  const start=r.startMeasure*p.beats,end=(r.endMeasure+1)*p.beats;
  labels.set(start,'rit.');
  if(r.returnToTempo&&end<length)labels.set(end,'a tempo');
 }
 const beats=new Set<number>([...labels.keys()]);
 for(const r of ramps){
  const start=r.startMeasure*p.beats,end=Math.min(length,(r.endMeasure+1)*p.beats);
  for(let tick=start;tick<end-1e-9;tick+=step)beats.add(round(tick));
  if(end<length)beats.add(end);
 }
 const positions=[...beats].filter(b=>b>=0&&b<length).sort((a,b)=>a-b);
 return positions.map(beat=>({beat,bpm:tempoAtBeat(p,beat),...(labels.has(beat)?{label:labels.get(beat)}:{})}));
}
/** The conductor cue freezes the transport after the marked measure.
 * A timed fermata lengthens the final sounding duration; notation stays unchanged.
 */
export function fermatasAtMeasure(p:Project,measure:number):FermataMark[]{
 return (p.fermatas??[]).filter(m=>m.measure===measure);
}
export function noteFermataDuration(p:Project,instrument:Instrument,absoluteBeat:number,durationBeats:number):number{
 const noteBar=Math.floor((absoluteBeat+1e-7)/p.beats);
 const mark=(p.fermatas??[]).find(f=>f.measure===noteBar&&f.instrument===instrument);
 if(!mark)return durationBeats;
 const endOfBar=(noteBar+1)*p.beats;
 if(absoluteBeat+durationBeats<endOfBar-1e-7)return durationBeats;
 return durationBeats+mark.holdBeats;
}
/** Remap measure-relative markings for insertion or deletion. A cut through a
 * ritardando removes that ramp rather than silently changing its meaning.
 */
export function shiftTempoMarks(p:Project,mode:'insert'|'delete',from:number,count:number):
 Pick<Project,'ritardandos'|'fermatas'>{
 const end=from+count;
 const convert=(measure:number)=>mode==='insert'?(measure>=from?measure+count:measure):
   measure>=from&&measure<end?null:measure>=end?measure-count:measure;
 const fermatas=(p.fermatas??[]).flatMap(f=>{
  const m=convert(f.measure);return m===null?[]:[{...f,measure:m}];
 });
 const ritardandos=(p.ritardandos??[]).flatMap(r=>{
  if(mode==='delete'&&r.startMeasure<end&&r.endMeasure>=from)return [];
  if(mode==='insert'&&r.startMeasure<from&&r.endMeasure>=from)
   return [{...r,endMeasure:r.endMeasure+count}];
  const a=convert(r.startMeasure),b=convert(r.endMeasure);
  return a===null||b===null?[]:[{...r,startMeasure:a,endMeasure:b}];
 });
 return {fermatas,ritardandos};
}
/** Only completely enclosed expressive ranges are copied into a new location. */
export function copyTempoMarks(p:Project,from:number,count:number,to:number):Pick<Project,'ritardandos'|'fermatas'>{
 const end=from+count,delta=to-from;
 return {
  ritardandos:(p.ritardandos??[]).filter(r=>r.startMeasure>=from&&r.endMeasure<end)
    .map(r=>({...r,startMeasure:r.startMeasure+delta,endMeasure:r.endMeasure+delta})),
  fermatas:(p.fermatas??[]).filter(f=>f.measure>=from&&f.measure<end)
    .map(f=>({...f,measure:f.measure+delta}))
 };
}
