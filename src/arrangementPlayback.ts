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
