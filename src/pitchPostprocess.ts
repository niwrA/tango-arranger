/** Reversible, deterministic conversion of a recorded fractional-MIDI timeline into a note proposal.
 * No score mutations and no assumptions that missing pitch at the start means a missed note.
 */
export type PitchFrame={
 timeSeconds:number;beat:number|null;midi:number|null;clarity:number|null;levelDbfs:number;
};
export type PitchPostprocessOptions={
 pitchMode:'onset'|'median';pitchBiasCents:number;
 onsetGridBeats:number;durationGridBeats:number;
 separation:'sensitive'|'balanced'|'conservative';detectVibrato:boolean;
};
export type ProcessedPitchNote={
 startBeat:number;durationBeats:number;pitch:number;intonationCents:number;
 vibrato:boolean;supportFrames:number;
};
export const DEFAULT_PITCH_POSTPROCESS:PitchPostprocessOptions={
 pitchMode:'median',pitchBiasCents:20,onsetGridBeats:0.25,durationGridBeats:0.25,
 separation:'balanced',detectVibrato:false
};
type Sample={time:number;beat:number;pitch:number;level:number;sourceIndex:number};
const median=(values:number[]):number=>{
 const sorted=[...values].sort((a,b)=>a-b);const n=sorted.length;
 return n? n%2?sorted[(n-1)/2]:(sorted[n/2-1]+sorted[n/2])/2:0;
};
const snap=(value:number,grid:number)=>grid>0?Math.round(value/grid)*grid:value;
const clamp=(value:number,lo:number,hi:number)=>Math.min(hi,Math.max(lo,value));

/** Conservative periodicity flag, not a calibrated voice/vibrato classifier. */
export function hasLikelyVibrato(samples:ReadonlyArray<{time:number;pitch:number}>):boolean{
 if(samples.length<12||samples.at(-1)!.time-samples[0].time<0.5)return false;
 const steps=samples.slice(1).map((s,i)=>s.time-samples[i].time).filter(d=>d>0.008&&d<0.2);
 const dt=median(steps);
 if(!dt||dt>0.09)return false; // Do not infer vibrato from severely undersampled data.
 const values=samples.map(s=>s.pitch);
 const residual=values.map((value,i)=>{
  const from=Math.max(0,i-4),to=Math.min(values.length,i+5);
  return value-values.slice(from,to).reduce((a,b)=>a+b,0)/(to-from);
 });
 const rms=Math.sqrt(residual.reduce((total,x)=>total+x*x,0)/residual.length);
 if(rms<0.075||rms>0.85)return false;
 const signs=residual.map(x=>Math.abs(x)>=0.02?Math.sign(x):0).filter(Boolean);
 const crossings=signs.slice(1).filter((sign,i)=>sign!==signs[i]).length;
 if(crossings<4)return false;
 let strongest=-1;
 for(let lag=2;lag<=Math.min(8,Math.floor(values.length/3));lag++){
  const rate=1/(lag*dt);
  if(rate<3.5||rate>7.5)continue;
  let dot=0,a=0,b=0;
  for(let i=0;i<residual.length-lag;i++){
   dot+=residual[i]*residual[i+lag];a+=residual[i]*residual[i];b+=residual[i+lag]*residual[i+lag];
  }
  if(a>0&&b>0)strongest=Math.max(strongest,dot/Math.sqrt(a*b));
 }
 return strongest>=0.62;
}

/** The frame beat is relative to recording start: count-in beats (< 0) are excluded. */
export function reprocessPitchFrames(
 frames:ReadonlyArray<PitchFrame>,options:PitchPostprocessOptions,
 scoreShiftSemitones:number,totalBeats:number
):ProcessedPitchNote[]{
 if(!Number.isFinite(totalBeats)||totalBeats<=0||!Number.isFinite(scoreShiftSemitones))return [];
 const all=frames.filter(f=>Number.isFinite(f.timeSeconds)&&f.beat!==null&&Number.isFinite(f.beat)&&
  f.beat!>=0&&f.beat!<totalBeats).sort((a,b)=>a.timeSeconds-b.timeSeconds);
 const valid=(f:PitchFrame)=>f.midi!==null&&Number.isFinite(f.midi)&&f.clarity!==null&&f.clarity>=0.65&&
  f.midi!-scoreShiftSemitones>=0&&f.midi!-scoreShiftSemitones<=127;
 const samples:Sample[]=[];
 all.forEach((f,i)=>{if(valid(f))samples.push({time:f.timeSeconds,beat:f.beat!,pitch:f.midi!-scoreShiftSemitones,
  level:Number.isFinite(f.levelDbfs)?f.levelDbfs:-90,sourceIndex:i});});
 if(!samples.length)return [];
 const dt=median(samples.slice(1).map((s,i)=>s.time-samples[i].time).filter(t=>t>0.015&&t<0.12))||0.05;
 const db=median(samples.slice(1).map((s,i)=>s.beat-samples[i].beat).filter(b=>b>0&&b<0.5))||0.1;
 const interval=clamp(db,0.025,0.25);
 const gapLimit={sensitive:0.11,balanced:0.20,conservative:0.29}[options.separation];
 const pitchThreshold={sensitive:0.60,balanced:0.77,conservative:0.95}[options.separation];
 const dipThreshold={sensitive:7,balanced:10,conservative:15}[options.separation];
 const groups:Sample[][]=[];let group:Sample[]=[];
 const close=()=>{if(group.length)groups.push(group);group=[];};
 for(let i=0;i<samples.length;i++){
  const s=samples[i];
  if(group.length){
   const prev=group.at(-1)!;
   const elapsed=s.time-prev.time;
   const gap=all.slice(prev.sourceIndex+1,s.sourceIndex);
   const before=median(group.slice(-4).map(x=>x.level));
   const after=median(samples.slice(i,i+3).map(x=>x.level));
   const gapBottom=gap.length?Math.min(...gap.map(f=>Number.isFinite(f.levelDbfs)?f.levelDbfs:-90)):Infinity;
   // Short breath/consonant-like dips can mark a repeated same-pitch note.
   // Never assume every gap is an articulation: user can validate and split manually.
   const articulation=gap.length>0&&elapsed>dt*1.5&&
    Math.min(before,after)-gapBottom>=dipThreshold&&
    (options.separation==='sensitive'||gap.length>=2);
   const previousCenter=median(group.slice(-Math.min(group.length,7)).map(x=>x.pitch));
   const future=samples.slice(i,i+3).filter(x=>x.time-s.time<=0.16);
   const futureCenter=median(future.map(x=>x.pitch));
   const jump=future.length>=2&&Math.abs(futureCenter-previousCenter)>=pitchThreshold&&
    future.slice(0,2).every(x=>Math.abs(x.pitch-previousCenter)>=pitchThreshold*0.72&&
      Math.sign(x.pitch-previousCenter)===Math.sign(futureCenter-previousCenter));
   // A deep short signal valley without null pitch may also mark rearticulation.
   const nearbyBefore=group.slice(-4).map(x=>x.level);
   const nearbyAfter=samples.slice(i+1,i+4).map(x=>x.level);
   const levelNotch=nearbyBefore.length>=2&&nearbyAfter.length>=2&&
     Math.min(median(nearbyBefore),median(nearbyAfter))-s.level>=dipThreshold+3&&
     s.time-group[0].time>=0.15;
   // Same-pitch re-attacks often remain fully voiced in a pitch tracker. Look for
   // a short, local amplitude valley followed by recovery, not just missing frames.
   // Compare both sides of the valley; a gradual diminuendo must not split.
   const window=Math.max(0.055,Math.min(0.13,dt*2.5));
   const left=samples.slice(Math.max(0,i-8),i).filter(x=>s.time-x.time<=window);
   const right=samples.slice(i+1,i+9).filter(x=>x.time-s.time<=window);
   const localDip=left.length>=2&&right.length>=2&&
    median(left.map(x=>x.level))-s.level>=dipThreshold&&
    median(right.map(x=>x.level))-s.level>=dipThreshold&&
    Math.abs(median(left.map(x=>x.pitch))-median(right.map(x=>x.pitch)))<0.5&&
    s.time-group[0].time>=0.15;
   // Split at the recovering frame, retaining the valley in the preceding note.
   if(elapsed>gapLimit||articulation||jump||levelNotch||localDip)close();
  }
  group.push(s);
 }
 close();
 const result:ProcessedPitchNote[]=[];
 for(let i=0;i<groups.length;i++){
  const g=groups[i];
  if(g.length<2||g.at(-1)!.time-g[0].time<0.045)continue;
  const rawPitch=options.pitchMode==='onset'?median(g.slice(0,3).map(s=>s.pitch)):median(g.map(s=>s.pitch));
  const pitch=clamp(Math.round(rawPitch+clamp(options.pitchBiasCents,-50,50)/100),0,127);
  const start=snap(g[0].beat,options.onsetGridBeats);
  const endRaw=Math.min(totalBeats,g.at(-1)!.beat+interval);
  const duration=snap(Math.max(0,endRaw-g[0].beat),options.durationGridBeats);
  const minimum=options.durationGridBeats>0?Math.min(0.125,options.durationGridBeats):0.125;
  const durationBeats=clamp(Math.max(minimum,duration),0,totalBeats-start);
  if(durationBeats<=0)continue;
  result.push({startBeat:Number(start.toFixed(6)),durationBeats:Number(durationBeats.toFixed(6)),pitch,
   intonationCents:Math.round((rawPitch-pitch)*100),
   vibrato:options.detectVibrato&&hasLikelyVibrato(g),supportFrames:g.length});
 }
 for(let i=0;i<result.length-1;i++){
  // Never allow quantization to create overlapping same-voice notes.
  const maxLength=result[i+1].startBeat-result[i].startBeat;
  if(maxLength<=0){result.splice(i,1);i--;continue;}
  result[i].durationBeats=Number(Math.min(result[i].durationBeats,maxLength).toFixed(6));
 }
 return result;
}
