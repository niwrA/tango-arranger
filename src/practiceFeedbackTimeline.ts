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

type Segment={row:number;pitch:number;start:number;duration:number;status:FeedbackStatus;continuation:boolean};
type FeedbackMeasure={index:number;expected:Segment[];detected:Segment[]};

export function practiceFeedbackMeasures(rows:readonly LearnTakeRow[],clock:LearnTakeClock,beats:number,count:number){
 const measures=new Map<number,FeedbackMeasure>();
 const measureAt=(index:number)=>{
  const measure=measures.get(index)??{index,expected:[],detected:[]};
  measures.set(index,measure);
  return measure;
 };
 for(let index=0;index<count;index++)measureAt(index);
 function add(lane:'expected'|'detected',row:number,pitch:number,start:number,duration:number,status:FeedbackStatus){
  const first=Math.floor(start/beats),end=start+duration;
  for(let measure=first;measure*beats<end-1e-8;measure++){
   const offset=measure*beats,partStart=Math.max(start,offset);
   measureAt(measure)[lane].push({
    row,pitch,status,start:partStart-offset,duration:Math.min(end,offset+beats)-partStart,
    continuation:measure!==first,
   });
  }
 }
 rows.forEach((row,index)=>{
  const status=feedbackStatus(row);
  if(row.kind!=='extra')add('expected',index,row.target.pitch,row.target.startBeat,row.target.durationBeats,status);
  if(row.kind==='matched'||row.kind==='extra')add('detected',index,row.played.pitch,
    (row.played.startBeat-clock.offsetBeats)/clock.tempoScale,row.played.durationBeats/clock.tempoScale,status);
 });
 return [...measures.values()].sort((a,b)=>a.index-b.index);
}
