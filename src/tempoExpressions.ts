import type {Instrument, Project} from './music';

/** Absolute measure indices are zero-based; all changes are score-wide, not per staff. */
export type Ritardando={startMeasure:number;endMeasure:number;toPercent:number};
export type FermataCue={measure:number;instrument:Instrument;stretch:number;waitForCue:boolean};
export type TempoExpressions={ritardandos:Ritardando[];fermatas:FermataCue[];aTempoMeasures:number[]};
export type TempoPoint={beat:number;bpm:number;label?:'rit.'|'a tempo'};
type TimingProject=Pick<Project,'beats'|'bpm'|'bars'|'tempoExpressions'|'instruments'>;
const clone=<T>(x:T):T=>JSON.parse(JSON.stringify(x)) as T;
const near=(a:number,b:number)=>Math.abs(a-b)<1e-7;
export function validateTempoExpressions(p:TimingProject,expressions:TempoExpressions):void{
 const total=p.bars.length,beats=p.beats;
 if(!Number.isFinite(p.bpm)||p.bpm<=0||!Number.isInteger(beats)||beats<1||!total)throw Error('Invalid song timing');
 const ramps=[...expressions.ritardandos].sort((a,b)=>a.startMeasure-b.startMeasure);
 for(const [i,r] of ramps.entries()){
  if(!Number.isInteger(r.startMeasure)||!Number.isInteger(r.endMeasure)||r.startMeasure<0||r.endMeasure<r.startMeasure||r.endMeasure>=total)
   throw Error('Ritardando measures must be within the song');
  if(!Number.isFinite(r.toPercent)||r.toPercent<35||r.toPercent>=100)throw Error('Ritardando target must be 35–99% of the song tempo');
  if(i&&r.startMeasure<=ramps[i-1].endMeasure)throw Error('Ritardando ranges cannot overlap');
 }
 const cueMeasures=new Set<number>();
 for(const mark of expressions.fermatas){
  if(!Number.isInteger(mark.measure)||mark.measure<0||mark.measure>=total)throw Error('Fermata measure is outside the song');
  if(!Number.isFinite(mark.stretch)||mark.stretch<1.25||mark.stretch>5)throw Error('Fermata stretch must be 1.25–5');
  if(typeof mark.waitForCue!=='boolean')throw Error('Invalid singer-cue mode');
  if(!p.instruments?.includes(mark.instrument))throw Error('Select an active instrument for the fermata');
  if(cueMeasures.has(mark.measure))throw Error('Only one score-wide fermata is allowed per measure');
  cueMeasures.add(mark.measure);
 }
 const seen=new Set<number>();
 for(const measure of expressions.aTempoMeasures){
  if(!Number.isInteger(measure)||measure<0||measure>=total||seen.has(measure))throw Error('A tempo measure must be unique and within the song');
  if(ramps.some(r=>measure>=r.startMeasure&&measure<=r.endMeasure))throw Error('A tempo cannot occur inside a ritardando');
  seen.add(measure);
 }
}
export function normalizedTempoExpressions(p:TimingProject):TempoExpressions {
 const e=p.tempoExpressions;
 if(!e)return {ritardandos:[],fermatas:[],aTempoMeasures:[]};
 const result={
  ritardandos:clone(e.ritardandos??[]).sort((a,b)=>a.startMeasure-b.startMeasure),
  fermatas:clone(e.fermatas??[]).sort((a,b)=>a.measure-b.measure),
  aTempoMeasures:[...(e.aTempoMeasures??[])].sort((a,b)=>a-b)
 };
 validateTempoExpressions(p,result);
 return result;
}
/** Tempo remains slow after rit. until explicitly restored by 'a tempo'. */
export function writtenTempoAtBeat(p:TimingProject,beat:number):number{
 const e=normalizedTempoExpressions(p);
 let tempo=p.bpm;
 for(const event of [
  ...e.ritardandos.map(r=>({at:r.startMeasure*p.beats,type:'rit' as const,r})),
  ...e.aTempoMeasures.map(m=>({at:m*p.beats,type:'return' as const,r:undefined}))
 ].sort((a,b)=>a.at-b.at)){
  if(beat<event.at)break;
  if(event.type==='return'){tempo=p.bpm;continue;}
  const r=event.r!;
  const lastBeat=(r.endMeasure+1)*p.beats-1;
  const fraction=Math.max(0,Math.min(1,(beat-event.at)/Math.max(1,lastBeat-event.at)));
  tempo=p.bpm*(1-(1-r.toPercent/100)*fraction);
 }
 return tempo;
}
/** Fermatas stretch one concluding beat for ensemble practice; singer cue stops the timeline after it. */
export function performanceTempoAtBeat(p:TimingProject,beat:number):number{
 let tempo=writtenTempoAtBeat(p,beat);
 for(const f of p.tempoExpressions?.fermatas??[]){
  const end=(f.measure+1)*p.beats;
  if(beat>=end-1-1e-7&&beat<end-1e-7){tempo/=f.stretch;break;}
 }
 return tempo;
}
export function tempoAutomationPoints(p:TimingProject):TempoPoint[]{
 const e=normalizedTempoExpressions(p),times=new Set<number>();
 for(const r of e.ritardandos){
  const start=r.startMeasure*p.beats,end=(r.endMeasure+1)*p.beats-1;
  for(let b=start;b<=end+1e-7;b+=0.5)times.add(Number(Math.min(b,end).toFixed(6)));
 }
 for(const b of e.aTempoMeasures)times.add(b*p.beats);
 for(const f of e.fermatas){
  times.add((f.measure+1)*p.beats-1);
  const end=(f.measure+1)*p.beats;
  if(end<p.bars.length*p.beats)times.add(end);
 }
 const points:TempoPoint[]=[];
 for(const beat of [...times].sort((a,b)=>a-b)){
  const label=e.ritardandos.some(r=>r.startMeasure*p.beats===beat)?'rit.':
   e.aTempoMeasures.some(m=>m*p.beats===beat)?'a tempo':undefined;
  const bpm=Number(performanceTempoAtBeat(p,beat).toFixed(4));
  if(label||!points.length||!near(bpm,points[points.length-1].bpm))points.push({beat,bpm,...(label?{label}:{})});
 }
 return points;
}
/** Approximate the changing beat duration by integrating 1/4-beat slices, including fermata stretch. */
export function soundingSeconds(p:TimingProject,startBeat:number,durationBeats:number,speed=1):number{
 if(!Number.isFinite(durationBeats)||durationBeats<0||!Number.isFinite(speed)||speed<=0)throw Error('Invalid playback duration');
 let result=0;
 for(let b=startBeat;b<startBeat+durationBeats-1e-8;){
  const step=Math.min(0.25,startBeat+durationBeats-b);
  result+=step*60/(performanceTempoAtBeat(p,b+step/2)*speed);
  b+=step;
 }
 return result;
}
/** Structural operations must move the score-wide timing marks together with note events. */
export function moveTempoExpressions(e:TempoExpressions|undefined,mode:'insert'|'delete',from:number,to:number):TempoExpressions|undefined{
 if(!e)return undefined;
 const count=to-from;
 const at=(measure:number):number|null=>mode==='insert'?(measure>=from?measure+count:measure):
    (measure>=from&&measure<to?null:measure>=to?measure-count:measure);
 return {
  ritardandos:e.ritardandos.flatMap(r=>{
   if(mode==='delete'&&r.startMeasure<to&&r.endMeasure>=from)return [];
   const start=at(r.startMeasure),end=at(r.endMeasure);
   return start===null||end===null?[]:[{...r,startMeasure:start,endMeasure:end}];
  }),
  fermatas:e.fermatas.flatMap(f=>{const m=at(f.measure);return m===null?[]:[{...f,measure:m}];}),
  aTempoMeasures:e.aTempoMeasures.map(at).filter((m):m is number=>m!==null)
 };
}
export function duplicateTempoExpressions(e:TempoExpressions|undefined,from:number,count:number,destination:number):TempoExpressions|undefined{
 if(!e)return undefined;
 const shift=destination-from,stop=from+count;
 return {
  ritardandos:[...clone(e.ritardandos),...e.ritardandos.filter(r=>r.startMeasure>=from&&r.endMeasure<stop).map(r=>({...clone(r),startMeasure:r.startMeasure+shift,endMeasure:r.endMeasure+shift}))],
  fermatas:[...clone(e.fermatas),...e.fermatas.filter(f=>f.measure>=from&&f.measure<stop).map(f=>({...clone(f),measure:f.measure+shift}))],
  aTempoMeasures:[...e.aTempoMeasures,...e.aTempoMeasures.filter(m=>m>=from&&m<stop).map(m=>m+shift)].sort((a,b)=>a-b)
 };
}
