/** Convert a selected song measure into a transport-relative playback window. */
export type PlaybackOrigin='beginning'|'selected';
export interface ArrangementPlaybackWindow {
  startMeasure:number;
  startBeat:number;
  durationSeconds:number;
  secondsPerBeat:number;
}
export function arrangementPlaybackWindow(totalMeasures:number,beatsPerMeasure:number,bpm:number,startMeasure:number):ArrangementPlaybackWindow {
  if(!Number.isInteger(totalMeasures)||totalMeasures<1)throw Error('Arrangement must contain at least one measure');
  if(!Number.isFinite(beatsPerMeasure)||beatsPerMeasure<=0)throw Error('Invalid meter');
  if(!Number.isFinite(bpm)||bpm<=0)throw Error('Invalid tempo');
  const clamped=Math.max(0,Math.min(totalMeasures-1,Math.trunc(Number.isFinite(startMeasure)?startMeasure:0)));
  const secondsPerBeat=60/bpm;
  return {startMeasure:clamped,startBeat:clamped*beatsPerMeasure,durationSeconds:(totalMeasures-clamped)*beatsPerMeasure*secondsPerBeat,secondsPerBeat};
}
/** Earlier note attacks are skipped; all scheduled events are relative to the new start. */
export function arrangementEventTime(absoluteBeat:number,window:ArrangementPlaybackWindow):number|null {
  if(!Number.isFinite(absoluteBeat)||absoluteBeat<window.startBeat-1e-7)return null;
  return Math.max(0,(absoluteBeat-window.startBeat)*window.secondsPerBeat);
}
