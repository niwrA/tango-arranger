import type {ProcessedPitchNote} from './pitchPostprocess';

export type LearnTakeTarget={startBeat:number;durationBeats:number;pitch:number};

export type LearnTakeRow=
 | {kind:'matched';target:LearnTakeTarget;played:ProcessedPitchNote}
 | {kind:'missed';target:LearnTakeTarget}
 | {kind:'extra';played:ProcessedPitchNote};

/** Align in musical order. A wrong pitch near the expected attack is a
 * substitution, while an unrelated attack can remain extra. */
export function compareLearnTake(targets:readonly LearnTakeTarget[],played:readonly ProcessedPitchNote[]):LearnTakeRow[]{
 const width=played.length+1;
 const path=new Uint8Array((targets.length+1)*width);
 let previous=new Float64Array(width);
 let current=new Float64Array(width);
 for(let j=1;j<width;j++){previous[j]=j;path[j]=2;}
 for(let i=1;i<=targets.length;i++){
  const target=targets[i-1];
  path[i*width]=1;
  current[0]=i;
  for(let j=1;j<width;j++){
   const note=played[j-1];
   const offset=Math.abs(note.startBeat-target.startBeat);
   const substitution=previous[j-1]+offset*1.4+(note.pitch===target.pitch?0:0.95);
   const miss=previous[j]+1;
   const extra=current[j-1]+1;
   const index=i*width+j;
   if(offset<=1&&substitution<=miss&&substitution<=extra){current[j]=substitution;path[index]=3;}
   else if(miss<=extra){current[j]=miss;path[index]=1;}
   else{current[j]=extra;path[index]=2;}
  }
  [previous,current]=[current,previous];
 }
 const rows:LearnTakeRow[]=[];
 let i=targets.length,j=played.length;
 while(i||j){
  const step=path[i*width+j];
  if(step===3)rows.push({kind:'matched',target:targets[--i],played:played[--j]});
  else if(step===1)rows.push({kind:'missed',target:targets[--i]});
  else rows.push({kind:'extra',played:played[--j]});
 }
 return rows.reverse();
}
