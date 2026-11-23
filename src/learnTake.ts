import type {ProcessedPitchNote} from './pitchPostprocess';
import {matchesPracticePitch} from './learnPitch';

export type LearnTakeTarget={startBeat:number;durationBeats:number;pitch:number};
export type LearnTakeClock={offsetBeats:number;tempoScale:number};

export type LearnTakeRow=
 | {kind:'matched';target:LearnTakeTarget;played:ProcessedPitchNote;pitchMatches:boolean}
 | {kind:'missed';target:LearnTakeTarget}
 | {kind:'unresolved-repeat';target:LearnTakeTarget;played:ProcessedPitchNote}
 | {kind:'extra';played:ProcessedPitchNote};

const identity:LearnTakeClock={offsetBeats:0,tempoScale:1};
const median=(values:number[])=>{
 const ordered=[...values].sort((a,b)=>a-b);
 return (ordered[Math.floor((ordered.length-1)/2)]+ordered[Math.ceil((ordered.length-1)/2)])/2;
};
const detectedBeat=(scoreBeat:number,clock:LearnTakeClock)=>clock.offsetBeats+scoreBeat*clock.tempoScale;

function align(targets:readonly LearnTakeTarget[],played:readonly ProcessedPitchNote[],
 allowAnyOctave:boolean,clock:LearnTakeClock,anchorSearch=false){
 const width=played.length+1;
 const path=new Uint8Array((targets.length+1)*width);
 let previous=new Float64Array(width);
 let current=new Float64Array(width);
 for(let j=1;j<width;j++){previous[j]=j;path[j]=2;}
 const span=targets.length>1?targets.at(-1)!.startBeat-targets[0].startBeat:0;
 for(let i=1;i<=targets.length;i++){
  const target=targets[i-1];
  const expected=detectedBeat(target.startBeat,clock);
  path[i*width]=1;
  current[0]=i;
  for(let j=1;j<width;j++){
   const note=played[j-1];
   const offset=Math.abs(note.startBeat-expected);
   const exact=matchesPracticePitch(note.pitch,target.pitch,allowAnyOctave);
   // Search broadly for pitch anchors, but require local timing agreement
   // before classifying a pitch substitution or a final match.
   const cost=anchorSearch
    ?exact?Math.min(.75,offset/(2+span*.12)):Infinity
    :exact?(offset<=1.5?offset*.8:Infinity):(offset<=.55?1.15+offset:Infinity);
   const substitution=previous[j-1]+cost;
   const miss=previous[j]+1;
   const extra=current[j-1]+1;
   const index=i*width+j;
   if(substitution<=miss&&substitution<=extra){current[j]=substitution;path[index]=3;}
   else if(miss<=extra){current[j]=miss;path[index]=1;}
   else{current[j]=extra;path[index]=2;}
  }
  [previous,current]=[current,previous];
 }
 const rows:LearnTakeRow[]=[];
 let i=targets.length,j=played.length;
 while(i||j){
  const step=path[i*width+j];
  if(step===3){
   const target=targets[--i],note=played[--j];
   rows.push({kind:'matched',target,played:note,pitchMatches:matchesPracticePitch(note.pitch,target.pitch,allowAnyOctave)});
  }else if(step===1)rows.push({kind:'missed',target:targets[--i]});
  else rows.push({kind:'extra',played:played[--j]});
 }
 return {rows:rows.reverse(),cost:previous[played.length]};
}

function candidateClocks(rows:LearnTakeRow[]):LearnTakeClock[]{
 const anchors=rows.flatMap(row=>row.kind==='matched'&&row.pitchMatches?[row]:[]);
 if(anchors.length<3)return [];
 const offset=median(anchors.map(row=>row.played.startBeat-row.target.startBeat));
 const candidates:LearnTakeClock[]=[{offsetBeats:offset,tempoScale:1}];
 const stride=Math.ceil(anchors.length/32);
 const sample=anchors.filter((_,i)=>i%stride===0||i===anchors.length-1);
 const slopes:number[]=[];
 for(let i=0;i<sample.length;i++)for(let j=i+1;j<sample.length;j++){
  const distance=sample[j].target.startBeat-sample[i].target.startBeat;
  if(distance>=4)slopes.push((sample[j].played.startBeat-sample[i].played.startBeat)/distance);
 }
 if(anchors.length>=5&&slopes.length){
  const tempoScale=median(slopes);
  const offsetBeats=median(anchors.map(row=>row.played.startBeat-row.target.startBeat*tempoScale));
  candidates.push({offsetBeats,tempoScale});
 }
 return candidates.filter(clock=>Math.abs(clock.offsetBeats)<=4&&clock.tempoScale>=.65&&clock.tempoScale<=1.5);
}

export function alignLearnTake(targets:readonly LearnTakeTarget[],played:readonly ProcessedPitchNote[],allowAnyOctave=false){
 let clock=identity,best=align(targets,played,allowAnyOctave,clock),bestCost=best.cost;
 if(targets.length>=3&&played.length>=3){
  const search=align(targets,played,allowAnyOctave,identity,true);
  for(const candidate of candidateClocks(search.rows)){
   const aligned=align(targets,played,allowAnyOctave,candidate);
   const cost=aligned.cost+.35+.1*Math.abs(candidate.offsetBeats)+Math.abs(1-candidate.tempoScale);
   if(cost<bestCost){clock=candidate;best=aligned;bestCost=cost;}
  }
 }
 let prior:Extract<LearnTakeRow,{kind:'matched'|'unresolved-repeat'}>|undefined;
 const rows=best.rows.map((row):LearnTakeRow=>{
  if(row.kind==='extra')return row;
  if(row.kind==='matched'){prior=row.pitchMatches?row:undefined;return row;}
  const attack=detectedBeat(row.target.startBeat,clock);
  if(prior&&matchesPracticePitch(prior.target.pitch,row.target.pitch,allowAnyOctave)&&
    attack>=prior.played.startBeat&&attack+.12<prior.played.startBeat+prior.played.durationBeats){
   const repeat={...row,kind:'unresolved-repeat' as const,played:prior.played};
   prior=repeat;
   return repeat;
  }
  prior=undefined;
  return row;
 });
 return {rows,clock};
}
