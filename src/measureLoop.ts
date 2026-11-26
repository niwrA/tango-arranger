import {transposeTangoGesture,type TangoGesture} from './tangoGestures';
import {noteSoundingDuration,stringGlissandoPlayback,noteSoundingVelocity,type Note,type ExpressionRange,type Instrument,type Project,measureDynamicVelocity,melodyDuckingFactor,DYNAMIC_VELOCITIES} from './music';

export type MeasureLoopEvent={pitch:number;onsetSeconds:number;durationSeconds:number;velocity:number;slideTo?:number;endVelocity?:number;gesture?:TangoGesture;bowedTremolo?:Note['bowedTremolo'];bowedStrokeCount?:number};
/** Build one instrument-measure's loop events, preserving absolute-score note positions.
 * Times are relative to the selected measure. The sounding gate, not the written
 * note duration, controls audio. Long tails are clipped at the loop boundary. */
export function measureLoopEvents(notes:readonly Note[],measureIndex:number,beats:number,bpm:number,transpose=0,ranges:readonly ExpressionRange[]=[],instrument?:Instrument,project?:Project,allowSustainAcrossMeasures=false):MeasureLoopEvent[]{
  if(!Number.isInteger(measureIndex)||measureIndex<0)throw Error('Invalid measure index');
  if(!Number.isInteger(beats)||beats<1||beats>12)throw Error('Invalid beats per measure');
  if(!Number.isFinite(bpm)||bpm<=0)throw Error('Tempo must be positive');
  if(!Number.isFinite(transpose))throw Error('Invalid transposition');
  const start=measureIndex*beats,secondsPerBeat=60/bpm;
  return notes.filter(n=>n.start>=start-1e-7&&n.start<start+beats-1e-7)
    .map(raw=>{
      const n=raw.stringGlissando?stringGlissandoPlayback(raw,raw.start,allowSustainAcrossMeasures?Infinity:start+beats):raw;
      const offset=Math.max(0,n.start-start);
      const soundingBeats=allowSustainAcrossMeasures?noteSoundingDuration(n):Math.min(noteSoundingDuration(n),beats-offset);
      const matching=instrument?ranges.filter(r=>r.instrument===instrument&&n.start>=(r.startMeasure*beats+(r.startBeat??0))&&n.start<(r.endMeasure*beats+(r.endBeat??beats))):[];
      const scaled=(position:number,initial:number)=>matching.reduce((v,r)=>{
        const start=r.startMeasure*beats+(r.startBeat??0),end=r.endMeasure*beats+(r.endBeat??beats);
        const t=Math.max(0,Math.min(1,(position-start)/Math.max(0.001,end-start)));
        return v+Math.round(r.from+(r.to-r.from)*t-80);
      },initial);
      const duck=project&&instrument?melodyDuckingFactor(project,instrument,n.start):1;
      const mark=n.subito?DYNAMIC_VELOCITIES[n.subito]:undefined;
      const initial=mark===undefined?noteSoundingVelocity(n):mark;
      const startVelocity=Math.max(1,Math.min(127,Math.round((project&&instrument?measureDynamicVelocity(project,instrument,n.start,scaled(n.start,initial)):scaled(n.start,initial))*duck))); 
      const endVelocity=Math.max(1,Math.min(127,Math.round((n.swellTo??(project&&instrument?measureDynamicVelocity(project,instrument,n.start+soundingBeats-0.0001,scaled(n.start+soundingBeats,initial)):scaled(n.start+soundingBeats,initial)))*duck))); 
      return {
        pitch:Math.max(0,Math.min(127,n.pitch+transpose)),
        onsetSeconds:offset*secondsPerBeat,
        durationSeconds:Math.max(0.025,soundingBeats*secondsPerBeat),
        velocity:startVelocity,
        ...(n.slideTo!==undefined?{slideTo:Math.max(0,Math.min(127,n.slideTo+transpose))}:{}),
        ...(n.gesture?{gesture:transposeTangoGesture(n.gesture,transpose)}:{}),
        ...(n.bowedTremolo?{bowedTremolo:n.bowedTremolo,...(n.bowedTremolo.mode==='measured'?{bowedStrokeCount:soundingBeats*2**n.bowedTremolo.strokes}:{})}:{}),
        ...(n.swellTo!==undefined||matching.length?{endVelocity}:{}),
      };
    }).sort((a,b)=>a.onsetSeconds-b.onsetSeconds||a.pitch-b.pitch);
}
