import {bandoneonPlaybackPlan,playbackNotesInRange} from './arrangementPlayback';
import {measureLoopEvents,type MeasureLoopEvent} from './measureLoop';
import {noteSoundingDuration,openingPickupBeats,projectInstruments,type Instrument,type Note,type Project,type Score} from './music';
import {performanceTempoAtBeat,scoreClockSeconds,tempoAutomationPoints} from './tempoExpressions';

type DraftAuditionEvent={instrument:Instrument;note:Note;event:MeasureLoopEvent;onset:number;duration:number};

export function draftAuditionEvents(project:Project,score:Score,instrument:Instrument,firstMeasure:number,lastMeasure:number,speed:number,accompaniment=false){
 const {beats,bpm}=project,transpose=project.transposeSemitones??0;
 const pickup=firstMeasure===0?openingPickupBeats(project):0;
 const from=firstMeasure*beats+(pickup?beats-pickup:0);
 const to=(lastMeasure+1)*beats;
 const tempo=tempoAutomationPoints(project),initialBpm=performanceTempoAtBeat(project,0);
 const bellowsClock=(beat:number)=>scoreClockSeconds(tempo,initialBpm,from,beat,speed);
 const length=bellowsClock(to);
 const instruments=accompaniment?projectInstruments(project):[instrument];
 const events:DraftAuditionEvent[]=[];
 for(const part of instruments){
  const attacks=playbackNotesInRange(score[part]??[],from,to,transpose);
  const plan=bandoneonPlaybackPlan(project,part,attacks);
  for(const note of attacks){
   const bar=Math.floor((note.start+1e-7)/beats);
   const event=measureLoopEvents([note],bar,beats,bpm,transpose,project.expressionRanges??[],part,project,true)[0];
   if(!event)continue;
   event.bellowsSegments=plan.segments.get(note);
   if(event.bellowsSegments?.length)event.bellowsSecondsAtBeat=bellowsClock;
   const onset=bellowsClock(note.start);
   const duration=bellowsClock(Math.min(note.start+noteSoundingDuration(note),to))-onset;
   if(duration>0)events.push({instrument:part,note,event,onset,duration});
  }
 }
 return {events:events.sort((a,b)=>a.onset-b.onset||a.event.pitch-b.event.pitch),length};
}
