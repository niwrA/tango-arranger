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
