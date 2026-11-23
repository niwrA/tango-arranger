export type PracticeRecordingClock={startMs:number;msPerBeat:number;totalBeats:number};

export function practiceRecordingPulse(beat:number,beatsPerMeasure:number,totalBeats:number,firstMeasure:number){
 if(beat>=totalBeats)return {phase:'finish' as const,measure:null,beat:0,progress:1};
 const countIn=beat<0;
 const position=countIn?Math.max(0,beat+beatsPerMeasure):beat;
 const wholeBeat=Math.floor(position);
 return {
  phase:countIn?'count-in' as const:'recording' as const,
  measure:countIn?null:firstMeasure+Math.floor(wholeBeat/beatsPerMeasure),
  beat:wholeBeat%beatsPerMeasure+1,
  progress:position-wholeBeat,
 };
}
