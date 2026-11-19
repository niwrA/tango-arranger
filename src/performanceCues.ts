/** Visual-only slicing for the performance piano roll. MIDI notes are not changed:
 * a sustained note crossing a bar line becomes adjacent, clearly connected slices.
 * The same boundaries also apply to notes entering or leaving the visible window. */
export type TimedNote={start:number;duration:number};
export type MeasureNoteSlice<T extends TimedNote>={
  note:T;start:number;duration:number;continued:boolean;continues:boolean;
};
export function splitAtMeasureBoundaries<T extends TimedNote>(
  notes:readonly T[],beatsPerMeasure:number,windowStart:number,windowLength:number
):MeasureNoteSlice<T>[] {
  if(!Number.isFinite(beatsPerMeasure)||beatsPerMeasure<=0||!Number.isFinite(windowStart)||
    !Number.isFinite(windowLength)||windowLength<=0)return [];
  const slices:MeasureNoteSlice<T>[]=[];
  const endWindow=windowStart+windowLength,epsilon=1e-7;
  for(const note of notes){
    if(!Number.isFinite(note.start)||!Number.isFinite(note.duration)||note.duration<=0)continue;
    const noteEnd=note.start+note.duration;
    let cursor=Math.max(note.start,windowStart);
    const visibleEnd=Math.min(noteEnd,endWindow);
    while(cursor<visibleEnd-epsilon){
      const nextBoundary=(Math.floor((cursor+epsilon)/beatsPerMeasure)+1)*beatsPerMeasure;
      const end=Math.min(visibleEnd,nextBoundary);
      if(end<=cursor+epsilon)break;
      slices.push({
        note,start:cursor,duration:end-cursor,
        continued:cursor>note.start+epsilon,
        continues:end<noteEnd-epsilon
      });
      cursor=end;
    }
  }
  return slices;
}

/** Return the *sounding* MIDI pitches at the playback cursor, not every theoretical
 * note in the lead-sheet chord. Respects the caller's gate/articulation duration.
 * The returned order is stable and duplicates from multiple voices are removed.
 * For slides and gestures this is the note's attack/nominal pitch, not an audio FFT. */
export function soundingPitchesAtBeat<T extends {start:number;pitch:number}>(
 notes:readonly T[],beat:number,soundingDuration:(note:T)=>number
):number[]{
 if(!Number.isFinite(beat))return [];
 const active=new Set<number>();
 for(const note of notes){
  if(!Number.isFinite(note.start)||!Number.isInteger(note.pitch)||note.pitch<0||note.pitch>127)continue;
  if(beat+1e-7<note.start)continue;
  const duration=soundingDuration(note);
  if(Number.isFinite(duration)&&duration>0&&beat<note.start+duration-1e-7)active.add(note.pitch);
 }
 return [...active].sort((a,b)=>a-b);
}
