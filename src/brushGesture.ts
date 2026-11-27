export type BrushPoint={beat:number;pitch:number};
export type BrushStroke={fromBeat:number;toBeat:number;points:readonly BrushPoint[]};

/** Score and grid provide musical positions. Pointer direction is irrelevant to the selected time span. */
export function normalizeBrushStroke(samples:readonly BrushPoint[],step:number,totalBeats:number):BrushStroke|undefined{
 if(!Number.isFinite(step)||step<=0||!Number.isFinite(totalBeats)||totalBeats<=0)return;
 const byBeat=new Map<number,BrushPoint>();
 for(const point of samples){
  if(Number.isFinite(point.beat)&&point.beat>=0&&point.beat<totalBeats&&Number.isInteger(point.pitch)&&point.pitch>=0&&point.pitch<=127)
   byBeat.set(point.beat,{...point});
 }
 const points=[...byBeat.values()].sort((a,b)=>a.beat-b.beat);
 if(!points.length)return;
 return {fromBeat:points[0].beat,toBeat:Math.min(totalBeats,points[points.length-1].beat+step),points};
}

export function brushPitchAt(points:readonly BrushPoint[],beat:number,fallback:number):number{
 if(!points.length)return fallback;
 const next=points.findIndex(point=>point.beat>=beat);
 if(next===0)return points[0].pitch;
 if(next<0)return points[points.length-1].pitch;
 const before=points[next-1],after=points[next];
 return before.pitch+(after.pitch-before.pitch)*(beat-before.beat)/(after.beat-before.beat);
}
