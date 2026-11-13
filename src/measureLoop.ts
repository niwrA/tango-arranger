import {noteSoundingDuration,noteSoundingVelocity,type Note,type ExpressionRange,type Instrument} from './music';

export type MeasureLoopEvent={pitch:number;onsetSeconds:number;durationSeconds:number;velocity:number;slideTo?:number;endVelocity?:number};
/** Build one instrument-measure's loop events, preserving absolute-score note positions.
 * Times are relative to the selected measure. The sounding gate, not the written
 * note duration, controls audio. Long tails are clipped at the loop boundary. */
export function measureLoopEvents(notes:readonly Note[],measureIndex:number,beats:number,bpm:number,transpose=0,ranges:readonly ExpressionRange[]=[],instrument?:Instrument):MeasureLoopEvent[]{
  if(!Number.isInteger(measureIndex)||measureIndex<0)throw Error('Invalid measure index');
  if(!Number.isInteger(beats)||beats<1||beats>12)throw Error('Invalid beats per measure');
  if(!Number.isFinite(bpm)||bpm<=0)throw Error('Tempo must be positive');
  if(!Number.isFinite(transpose))throw Error('Invalid transposition');
  const start=measureIndex*beats,secondsPerBeat=60/bpm;
  return notes.filter(n=>n.start>=start-1e-7&&n.start<start+beats-1e-7)
    .map(n=>{
      const offset=Math.max(0,n.start-start);
      const soundingBeats=Math.min(noteSoundingDuration(n),beats-offset);
      const matching=instrument?ranges.filter(r=>r.instrument===instrument&&n.start>=(r.startMeasure*beats+(r.startBeat??0))&&n.start<(r.endMeasure*beats+(r.endBeat??beats))):[];
      const scaled=(position:number,initial:number)=>matching.reduce((v,r)=>{
        const start=r.startMeasure*beats+(r.startBeat??0),end=r.endMeasure*beats+(r.endBeat??beats);
        const t=Math.max(0,Math.min(1,(position-start)/Math.max(0.001,end-start)));
        return v+Math.round(r.from+(r.to-r.from)*t-80);
      },initial);
      const startVelocity=Math.max(1,Math.min(127,scaled(n.start,noteSoundingVelocity(n))));
      const endVelocity=Math.max(1,Math.min(127,n.swellTo??scaled(n.start+soundingBeats,noteSoundingVelocity(n))));
      return {
        pitch:Math.max(0,Math.min(127,n.pitch+transpose)),
        onsetSeconds:offset*secondsPerBeat,
        durationSeconds:Math.max(0.025,soundingBeats*secondsPerBeat),
        velocity:startVelocity,
        ...(n.slideTo!==undefined?{slideTo:Math.max(0,Math.min(127,n.slideTo+transpose))}:{}),
        ...(n.swellTo!==undefined||matching.length?{endVelocity}:{}),
      };
    }).sort((a,b)=>a.onsetSeconds-b.onsetSeconds||a.pitch-b.pitch);
}
