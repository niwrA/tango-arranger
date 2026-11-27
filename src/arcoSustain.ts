import type {ExpressiveEvent} from './expressiveAudio';
import {arcoBank} from './openSampleBanks';
/** Read standard forward-loop markers from a RIFF WAV smpl chunk.
 * Loop end is inclusive in RIFF, exclusive in Web Audio.
 */
export function readWavLoop(bytes:ArrayBuffer):{start:number;end:number}|undefined{
 const v=new DataView(bytes),tag=(p:number)=>v.getUint32(p,false);
 if(v.byteLength<12||tag(0)!==0x52494646||tag(8)!==0x57415645)return;
 let rate=0,loop:{start:number;end:number}|undefined;
 for(let p=12;p+8<=v.byteLength;){
  const size=v.getUint32(p+4,true),q=p+8;
  if(size>v.byteLength-q)break;
  if(tag(p)===0x666d7420&&size>=16)rate=v.getUint32(q+4,true);
  if(tag(p)===0x736d706c&&size>=60&&v.getUint32(q+28,true)>0&&v.getUint32(q+40,true)===0){
   const start=v.getUint32(q+44,true),end=v.getUint32(q+48,true)+1;
   if(end>start)loop={start,end};
  }
  p=q+size+(size%2);
 }
 if(rate&&loop)return {start:loop.start/rate,end:loop.end/rate};
}
type Sample={pitch:number;buffer:AudioBuffer;start?:number;end?:number};
type Voice={inst:string;source:AudioBufferSourceNode;gain:GainNode;level:GainNode};
const banks=new Map<string,Promise<Sample[]>>();
const ready=new Map<string,Sample[]>();
const voices=new Set<Voice>();
function family(inst:string){return inst.toLowerCase().includes('violin')?'violin':'bass';}
function midi(name:string){const m=/^([A-G])(#?)(-?\d+)$/.exec(name)!;return (Number(m[3])+1)*12+(({C:0,D:2,E:4,F:5,G:7,A:9,B:11} as Record<string,number>)[m[1]]??0)+(m[2]?1:0);}
export function prepareArcoSustain(ctx:AudioContext,inst:string):Promise<Sample[]>{
 const bank=arcoBank(inst);if(!bank)return Promise.resolve([]);
 const key=family(inst);const existing=banks.get(key);if(existing)return existing;
 const base=key==='bass'?bank.baseUrl.replace('/arco/','/arco_looped/'):bank.baseUrl;
 const task=Promise.all(Object.entries(bank.urls).map(async ([pitch,file])=>{
  try{
   const response=await fetch(base+file,{signal:AbortSignal.timeout(20000)});
   if(!response.ok)return undefined;
   const bytes=await response.arrayBuffer(),loop=readWavLoop(bytes);
   const buffer=await ctx.decodeAudioData(bytes);
   // Unmarked recordings can still render short gestures without looping.
   const valid=loop&&loop.start>=0&&loop.end<=buffer.duration&&loop.end-loop.start>=0.08?loop:undefined;
   const sample:Sample={pitch:midi(pitch),buffer,...valid};return sample;
  }catch{return undefined;}
 })).then(results=>{const samples=results.filter((s):s is Sample=>s!==undefined);ready.set(key,samples);if(!samples.length)banks.delete(key);return samples;});
 banks.set(key,task);return task;
}
export function playArcoSustain(ctx:AudioContext,inst:string,pitch:number,duration:number,time:number,velocity:number,db:number,endVelocity=velocity):boolean{
 const samples=ready.get(family(inst))?.filter(s=>s.start!==undefined&&s.end!==undefined);if(!samples?.length||!Number.isFinite(duration)||duration<=0)return false;
 const sample=samples.reduce((a,b)=>Math.abs(a.pitch-pitch)<=Math.abs(b.pitch-pitch)?a:b);
 if(Math.abs(sample.pitch-pitch)>3)return false;
 const start=Math.max(ctx.currentTime,time),end=start+duration,release=Math.min(.12,duration*.3);
 const source=ctx.createBufferSource(),gain=ctx.createGain(),level=ctx.createGain();
 source.buffer=sample.buffer;source.loop=true;source.loopStart=sample.start!;source.loopEnd=sample.end!;
 source.playbackRate.value=2**((pitch-sample.pitch)/12);
 gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(Math.max(0,velocity),start+Math.min(.015,duration*.1));
 gain.gain.linearRampToValueAtTime(Math.max(0,endVelocity),end-release);gain.gain.linearRampToValueAtTime(0,end);
 level.gain.value=10**(db/20);source.connect(gain);gain.connect(level);level.connect(ctx.destination);
 const voice={inst,source,gain,level};voices.add(voice);
 source.onended=()=>{voices.delete(voice);source.disconnect();gain.disconnect();level.disconnect();};
 source.start(start);source.stop(end+.01);return true;
}
export function stopArcoSustain(predicate:(inst:string)=>boolean=()=>true){
 for(const voice of voices)if(predicate(voice.inst)){try{voice.source.stop();}catch{/* already ended */}}
}
export function setArcoSustainGain(inst:string,db:number){
 for(const voice of voices)if(voice.inst===inst)voice.level.gain.value=10**(db/20);
}

/** Select one original recording per continuous contour, never splice in the middle
 * of a slide. Bound transposition and require enough source audio or a real loop. */
export function gestureAnchor(pitches:number[],duration:number,samples:{pitch:number;seconds:number;loop:boolean}[]):number|undefined{
 if(!pitches.length||!pitches.every(Number.isFinite)||!Number.isFinite(duration)||duration<=0)return;
 const ranked=samples.map((s,i)=>({s,i,distance:Math.max(...pitches.map(p=>Math.abs(p-s.pitch)))}))
  .filter(({s,distance})=>distance<=5&&(s.loop||s.seconds>=duration*2**((Math.max(...pitches)-s.pitch)/12)+.03))
  .sort((a,b)=>a.distance-b.distance||Math.abs(a.s.pitch-pitches[0])-Math.abs(b.s.pitch-pitches[0]));
 return ranked[0]?.i;
}
export function playSampleGesture(ctx:AudioContext,inst:string,event:ExpressiveEvent,time:number,db:number):boolean{
 const duration=event.durationSeconds,samples=ready.get(family(inst));
 if(!samples?.length||!Number.isFinite(duration)||duration<=0)return false;
 const paths=event.gesture?[event.gesture.points,...(event.gesture.partner?[event.gesture.partner]:[])]:[[{at:0,pitch:event.pitch},{at:1,pitch:event.slideTo??event.pitch}]];
 const choices=paths.map(points=>gestureAnchor(points.map(p=>p.pitch),duration,samples.map(s=>({pitch:s.pitch,seconds:s.buffer.duration,loop:s.start!==undefined&&s.end!==undefined}))));
 // Atomic fallback for double sirenas: never render only one of the voices.
 if(choices.some(i=>i===undefined))return false;
 const start=Math.max(ctx.currentTime+.002,time),end=start+duration,attack=Math.min(.015,duration*.1),release=Math.min(.08,duration*.15);
 for(let i=0;i<paths.length;i++){
  const points=paths[i],sample=samples[choices[i]!],source=ctx.createBufferSource(),gain=ctx.createGain(),level=ctx.createGain();
  source.buffer=sample.buffer;
  if(sample.start!==undefined&&sample.end!==undefined){source.loop=true;source.loopStart=sample.start;source.loopEnd=sample.end;}
  const rate=(pitch:number)=>2**((pitch-sample.pitch)/12);
  source.playbackRate.setValueAtTime(rate(points[0].pitch),start);
  if(event.gesture?.kind==='latigo'&&points.length===2)source.playbackRate.setValueAtTime(rate(points[0].pitch),start+duration*.52);
  else if(!event.gesture&&event.slideTo!==undefined)source.playbackRate.setValueAtTime(rate(points[0].pitch),start+duration*.12);
  for(const pt of points.slice(1))source.playbackRate.exponentialRampToValueAtTime(rate(pt.pitch),start+duration*(event.gesture?.kind==='latigo'&&pt.at===1 ? .95 : pt.at));
  gain.gain.setValueAtTime(0,start);
  gain.gain.linearRampToValueAtTime(Math.max(0,Math.min(1,event.velocity/127))/paths.length,start+attack);
  gain.gain.linearRampToValueAtTime(Math.max(0,Math.min(1,(event.endVelocity??event.velocity)/127))/paths.length,end-release);
  gain.gain.linearRampToValueAtTime(0,end);
  const bow=ctx.createGain();
  if(event.bowedTremolo||event.gesture?.tremolo){
   const hz=event.bowedTremolo?(event.bowedStrokeCount!==undefined?Math.max(.1,Math.min(40,event.bowedStrokeCount/duration)):Math.max(4,Math.min(24,event.bowedTremolo.rateHz??14))):6;
   const period=1/hz,low=event.bowedTremolo ? .12 : .65;
   for(let t=start;t<end;t+=period){bow.gain.setValueAtTime(low,t);bow.gain.linearRampToValueAtTime(1,Math.min(end,t+period*.18));if(t+period*.65<end)bow.gain.linearRampToValueAtTime(.8,t+period*.65);}
  }else bow.gain.value=1;
  level.gain.value=10**(db/20);source.connect(gain);gain.connect(bow);bow.connect(level);level.connect(ctx.destination);
  const voice={inst,source,gain,level};voices.add(voice);
  source.onended=()=>{voices.delete(voice);source.disconnect();gain.disconnect();bow.disconnect();level.disconnect();};
  source.start(start);source.stop(end+.01);
 }
 return true;
}
