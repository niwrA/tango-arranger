import {noteSoundingDuration,type Note} from './music';
/** Convert a selected song measure into a transport-relative playback window. */
export type PlaybackOrigin='beginning'|'selected';
export interface ArrangementPlaybackWindow {
  startMeasure:number;
  startBeat:number;
  transportStartBeat:number;
  countInBeats:number;
  durationSeconds:number;
  secondsPerBeat:number;
}
export function arrangementPlaybackWindow(totalMeasures:number,beatsPerMeasure:number,bpm:number,startMeasure:number,pickupBeats=0,withCountIn=false):ArrangementPlaybackWindow {
  if(!Number.isInteger(totalMeasures)||totalMeasures<1)throw Error('Arrangement must contain at least one measure');
  if(!Number.isFinite(beatsPerMeasure)||beatsPerMeasure<=0)throw Error('Invalid meter');
  if(!Number.isFinite(bpm)||bpm<=0)throw Error('Invalid tempo');
  const clamped=Math.max(0,Math.min(totalMeasures-1,Math.trunc(Number.isFinite(startMeasure)?startMeasure:0)));
  const secondsPerBeat=60/bpm;
  const startBeat=clamped===0&&pickupBeats>0?beatsPerMeasure-pickupBeats:clamped*beatsPerMeasure;
  const countInBeats=withCountIn?beatsPerMeasure:0;
  return {startMeasure:clamped,startBeat,countInBeats,transportStartBeat:startBeat-countInBeats,durationSeconds:(totalMeasures*beatsPerMeasure-startBeat)*secondsPerBeat,secondsPerBeat};
}
/** Keep the full preparatory bar, then continue clicking through rests in a written pickup. */
export function arrangementCountInEnd(window:ArrangementPlaybackWindow,beatsPerMeasure:number,firstAttack:number):number {
  if(!window.countInBeats)return 0;
  const startsAtPickup=window.startMeasure===0&&window.startBeat>0;
  if(startsAtPickup&&firstAttack>=window.startBeat&&firstAttack<beatsPerMeasure)
    return firstAttack-window.transportStartBeat;
  return window.countInBeats;
}
/** Earlier note attacks are skipped; all scheduled events are relative to the new start. */
export function arrangementEventTime(absoluteBeat:number,window:ArrangementPlaybackWindow):number|null {
  if(!Number.isFinite(absoluteBeat)||absoluteBeat<window.startBeat-1e-7)return null;
  return Math.max(0,(absoluteBeat-window.startBeat)*window.secondsPerBeat);
}

/** Merge only explicitly tied, contiguous notes of the same pitch/staff/voice.
 * Notation remains untouched; the final segment's gate controls release. */
export function tiedPlaybackNotes(notes:readonly Note[]):Note[]{
 const result:Note[]=[],last=new Map<string,Note>();
 for(const note of [...notes].sort((a,b)=>a.start-b.start||a.pitch-b.pitch)){
  const key=[note.pitch,note.xmlStaff??1,note.xmlVoice??''].join(':');
  const previous=last.get(key);
  if(note.xmlTieContinuation&&previous&&Math.abs(previous.start+previous.duration-note.start)<1e-5){
   const audible=note.start-previous.start+noteSoundingDuration(note);
   previous.duration=note.start+note.duration-previous.start;
   previous.gate=audible/previous.duration;
  }else{
   const copy={...note};result.push(copy);last.set(key,copy);
  }
 }
 return result;
}
/** A selected playback range can begin inside a sustained note. */
export function playbackNotesInRange(notes:readonly Note[],start:number,end=Infinity):Note[]{
 return tiedPlaybackNotes(notes).flatMap(n=>{
  const audibleEnd=n.start+noteSoundingDuration(n);
  if(audibleEnd<=start+1e-7||n.start>=end-1e-7)return [];
  if(n.start>=start&&n.start+n.duration<=end)return [n];
  const onset=Math.max(start,n.start),duration=Math.min(end,n.start+n.duration)-onset;
  if(duration<=1e-7)return [];
  return [{...n,start:onset,duration,gate:Math.min(1,(Math.min(end,audibleEnd)-onset)/duration)}].filter(n=>n.gate>0);
 });
}
