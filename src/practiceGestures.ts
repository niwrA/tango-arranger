/** Live monophonic gesture recognition. Pitch is fractional MIDI; time is milliseconds. */
export type GestureSample={time:number;pitch:number};
export type SlideSpec={start:number;end:number;durationMs:number};
export function slideEvidence(samples:readonly GestureSample[],spec:SlideSpec,toleranceCents:number){
 const distance=spec.end-spec.start,span=Math.abs(distance),direction=Math.sign(distance);
 const tolerance=Math.max(.25,toleranceCents/100);
 if(span<.5||samples.length<3)return {progress:0,complete:false};
 const latest=samples[samples.length-1];
 const startIndex=samples.findIndex(s=>Math.abs(s.pitch-spec.start)<=tolerance);
 if(startIndex<0)return {progress:0,complete:false};
 const trace=samples.slice(startIndex);
 const progress=Math.max(0,Math.min(1,(latest.pitch-spec.start)/distance));
 if(trace.length<3)return {progress,complete:false};
 let reverse=0,intermediate=false;
 for(let i=1;i<trace.length;i++){
  const step=(trace[i].pitch-trace[i-1].pitch)*direction;
  if(step<-.18)reverse-=step;
  const p=(trace[i].pitch-spec.start)/distance;
  if(p>.15&&p<.85)intermediate=true;
  if(trace[i].time-trace[i-1].time>150)return {progress:0,complete:false};
 }
 const elapsed=latest.time-trace[0].time;
 return {progress,complete:intermediate&&reverse<=Math.max(.5,span*.35)&&elapsed>=Math.min(100,spec.durationMs*.3)&&elapsed<=Math.max(700,spec.durationMs*2.5)&&Math.abs(latest.pitch-spec.end)<=tolerance};
}
