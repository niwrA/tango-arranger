import type {LearnTakeClock,LearnTakeRow} from './learnTake';

export const feedbackStatuses={
 correct:'Pitch matched',
 wrong:'Wrong pitch',
 missed:'No detection',
 'unresolved-repeat':'Repeat unresolved',
 extra:'Extra detection',
} as const;

export type FeedbackStatus=keyof typeof feedbackStatuses;
export function feedbackStatus(row:LearnTakeRow):FeedbackStatus{
 return row.kind==='matched'?row.pitchMatches?'correct':'wrong':row.kind;
}

type TimelineNote={row:number;pitch:number;start:number;duration:number;status:FeedbackStatus};
type TimelineLane='expected'|'detected';

export function practiceFeedbackTimeline(rows:readonly LearnTakeRow[],clock:LearnTakeClock,beats:number,count:number){
 const lanes:Record<TimelineLane,TimelineNote[]>={expected:[],detected:[]};
 let firstMeasure=0,lastMeasure=count-1;
 function add(lane:TimelineLane,note:TimelineNote){
  lanes[lane].push(note);
  firstMeasure=Math.min(firstMeasure,Math.floor(note.start/beats));
  lastMeasure=Math.max(lastMeasure,Math.ceil((note.start+note.duration-1e-8)/beats)-1);
 }
 rows.forEach((row,index)=>{
  const status=feedbackStatus(row);
  if(row.kind!=='extra')add('expected',{
   row:index,pitch:row.target.pitch,start:row.target.startBeat,duration:row.target.durationBeats,status,
  });
  if(row.kind==='matched'||row.kind==='extra')add('detected',{
   row:index,pitch:row.played.pitch,start:(row.played.startBeat-clock.offsetBeats)/clock.tempoScale,
   duration:row.played.durationBeats/clock.tempoScale,status,
  });
 });
 const measures=Array.from({length:lastMeasure-firstMeasure+1},(_,index)=>firstMeasure+index);
 return {lanes,measures,start:firstMeasure*beats,span:measures.length*beats};
}
