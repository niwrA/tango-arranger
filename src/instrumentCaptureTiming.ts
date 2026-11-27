import type {CapturedTap} from './tapCapture';
import type {TangoGesture} from './tangoGestures';

/** Original transport timing, before any note grid is applied. Starts are
 * relative to the selected recording range; a missing duration is a tap. */
export type InstrumentCaptureEvent={
 startBeat:number;durationBeats?:number;pitch:number;velocity?:number;stringMidi?:number;
 approachSlideFrom?:number;vibrato?:boolean;gesture?:TangoGesture;
};
export type InstrumentCaptureTimingOptions={
 beatsPerMeasure:number;firstBar:number;lastBar:number;loop:boolean;
 onsetGrid:(bar:number)=>number;durationGrid:(bar:number)=>number;
};
export type TimedInstrumentCapture=CapturedTap&{
 pitch:number;duration:number;velocity?:number;stringMidi?:number;provisional?:true;
 approachSlideFrom?:number;vibrato?:boolean;gesture?:TangoGesture;
};
const round=(value:number)=>Math.round(value*1e6)/1e6;
const gridValue=(grid:number)=>{
 if(!Number.isFinite(grid)||grid<0)throw Error('Invalid capture timing grid');
 return grid;
};
const snap=(value:number,grid:number)=>grid>0?Math.round(value/grid)*grid:value;

/** Quantize known instrument attacks without re-detecting pitches or merging
 * overlapping voices. The source events are retained so grid changes can be
 * repeated, including restoring raw timing after a coarse quantization. */
export function quantizeInstrumentCapture(
 events:ReadonlyArray<InstrumentCaptureEvent>,options:InstrumentCaptureTimingOptions
):TimedInstrumentCapture[]{
 const {beatsPerMeasure:beats,firstBar:first,lastBar:last,loop}=options;
 const total=(last-first+1)*beats;
 if(!Number.isInteger(beats)||beats<1||!Number.isInteger(first)||first<0||
   !Number.isInteger(last)||last<first||!Number.isSafeInteger(total)||total<=0)
  throw Error('Invalid capture timing measure range');
 const prepared=events.flatMap(event=>{
  if(!Number.isFinite(event.startBeat)||event.startBeat<0||
    (!loop&&event.startBeat>=total)||!Number.isInteger(event.pitch)||event.pitch<0||event.pitch>127||
    (event.durationBeats!==undefined&&(!Number.isFinite(event.durationBeats)||event.durationBeats<=0)))return [];
  const position=loop?event.startBeat%total:event.startBeat;
  const bar=first+Math.min(last-first,Math.floor(position/beats));
  const onsetGrid=gridValue(options.onsetGrid(bar));
  const durationGrid=gridValue(options.durationGrid(bar));
  let start=snap(position,onsetGrid);
  if(loop)start%=total;
  else if(start>=total){
   // A late final attack belongs to the last measure, never the next pass.
   start=onsetGrid>0?Math.max(0,(Math.ceil(total/onsetGrid)-1)*onsetGrid):position;
  }
  start=round(start);
  // Sub-microbeat values that round to the range end cannot become beat zero.
  if(start>=total)start=round(total-1e-6);
  return [{event,start,durationGrid}];
 });
 const starts=[...new Set(prepared.map(note=>note.start))].sort((a,b)=>a-b);
 const nextStart=new Map(starts.map((start,index)=>[start,starts[index+1]??total]));
 const result=new Map<string,TimedInstrumentCapture>();
 for(const {event,start,durationGrid} of prepared){
  const barEnd=(Math.floor(start/beats)+1)*beats;
  const next=nextStart.get(start)??total;
  const provisionalLimit=Math.min(1,barEnd-start,next-start);
  const rawDuration=event.durationBeats??provisionalLimit;
  let duration=durationGrid>0?Math.max(durationGrid,snap(rawDuration,durationGrid)):rawDuration;
  // A tap has no release timestamp. Its inferred length may not erase a rest
  // or cover the following attack, even with a coarse duration grid.
  if(event.durationBeats===undefined)duration=Math.min(duration,provisionalLimit);
  duration=round(Math.min(duration,loop?total:total-start));
  let cursor=start,remaining=duration,firstSegment=true;
  while(remaining>0){
   const position=round(cursor%total);
   const bar=first+Math.floor(position/beats);
   const beat=round(position%beats);
   const segment=round(Math.min(remaining,beats-beat));
   if(segment<=0)break;
   const note:TimedInstrumentCapture={bar,beat,pitch:event.pitch,duration:segment,
    ...(event.velocity!==undefined?{velocity:event.velocity}:{}),
    ...(event.durationBeats===undefined?{provisional:true as const}:{}),
    ...(event.stringMidi!==undefined?{stringMidi:event.stringMidi}:{}),
    ...(firstSegment&&event.approachSlideFrom!==undefined?{approachSlideFrom:event.approachSlideFrom}:{}),
    ...(firstSegment&&event.vibrato?{vibrato:true}:{}),
    ...(firstSegment&&event.gesture?{gesture:{...event.gesture,
     points:event.gesture.points.map(point=>({...point})),
     ...(event.gesture.partner?{partner:event.gesture.partner.map(point=>({...point}))}:{})}}:{})
   };
   // Match live capture's replacement rule only for the same pitch/onset.
   // Different pitches remain independent, including sustained piano chords.
   result.set(`${bar}:${beat}:${event.pitch}`,note);
   cursor=round(cursor+segment);remaining=round(remaining-segment);firstSegment=false;
  }
 }
 return [...result.values()].sort((a,b)=>a.bar-b.bar||a.beat-b.beat||a.pitch-b.pitch);
}
