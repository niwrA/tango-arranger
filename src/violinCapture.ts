/** Classify a held violin finger trace without accessing DOM or audio.
 * Semitone cell positions are schematic. This records an expressive intent,
 * not measured vibrato frequency/depth or a physical fingertip position. */
export type ViolinCaptureSample={pitch:number;x:number;t:number};
export type ViolinCaptureMode='auto'|'notes'|'slide'|'vibrato';
export type ViolinCaptureDecision={kind:'note'|'slide'|'vibrato'|'sirena';startPitch:number;endPitch:number;peakPitch?:number};
function movementReversals(values:number[],deadband:number):number {
 let last=0,reversals=0;
 for(let i=1;i<values.length;i++){
  const delta=values[i]-values[i-1];
  if(Math.abs(delta)<deadband)continue;
  const dir=Math.sign(delta);
  if(last&&dir!==last)reversals++;
  last=dir;
 }
 return reversals;
}
export function classifyViolinCapture(samples:readonly ViolinCaptureSample[],mode:ViolinCaptureMode='auto'):ViolinCaptureDecision{
 if(!samples.length)throw Error('Violin capture requires at least one pitch');
 const start=samples[0].pitch,end=samples[samples.length-1].pitch;
 if(!samples.every(s=>Number.isInteger(s.pitch)&&s.pitch>=0&&s.pitch<=127&&Number.isFinite(s.x)&&Number.isFinite(s.t)))
  throw Error('Invalid violin finger trace');
 const fallback:ViolinCaptureDecision={kind:'note',startPitch:start,endPitch:start};
 if(mode==='notes')return fallback;
 const pitches=samples.map(s=>s.pitch),xs=samples.map(s=>s.x);
 const span=Math.max(...pitches)-Math.min(...pitches);
 const elapsed=Math.max(0,samples[samples.length-1].t-samples[0].t);
 const peak=Math.abs(Math.max(...pitches)-start)>=Math.abs(Math.min(...pitches)-start)
  ?Math.max(...pitches):Math.min(...pitches);
 const pitchTurns=movementReversals(pitches,0.5);
 // A large return sweep is a *candidate* sirena; annotate as one gesture
 // rather than storing duplicate note attacks for intermediate pitches.
 if(mode==='auto'&&elapsed>=140&&samples.length>=5&&span>=3&&Math.abs(end-start)<=1&&pitchTurns>=1)
  return {kind:'sirena',startPitch:start,endPitch:end,peakPitch:peak};
 // A deliberate move to a different semitone is a portamento into the final
 // written pitch. Never infer a slide from a shaky hold on the same cell.
 if(end!==start&&(mode==='auto'||mode==='slide'))
  return {kind:'slide',startPitch:start,endPitch:end};
 const xSpan=Math.max(...xs)-Math.min(...xs);
 if(mode==='vibrato'||(mode==='auto'&&elapsed>=200&&samples.length>=6&&xSpan>=10&&span<=2&&
    Math.abs(end-start)<=1&&movementReversals(xs,3)>=3))
  return {kind:'vibrato',startPitch:start,endPitch:start};
 return fallback;
}
