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
type Sample={pitch:number;buffer:AudioBuffer;start:number;end:number};
type Voice={inst:string;source:AudioBufferSourceNode;gain:GainNode;level:GainNode};
const banks=new Map<string,Promise<Sample[]>>();
const ready=new Map<string,Sample[]>();
const voices=new Set<Voice>();
function family(inst:string){return inst.toLowerCase().includes('violin')?'violin':'bass';}
function midi(name:string){const m=/^([A-G])(#?)(-?\d+)$/.exec(name)!;return (Number(m[3])+1)*12+({C:0,D:2,E:4,F:5,G:7,A:9,B:11}[m[1]]??0)+(m[2]?1:0);}
export function prepareArcoSustain(ctx:AudioContext,inst:string):Promise<Sample[]>{
 const bank=arcoBank(inst);if(!bank)return Promise.resolve([]);
 const key=family(inst);const existing=banks.get(key);if(existing)return existing;
 const base=key==='bass'?bank.baseUrl.replace('/arco/','/arco_looped/'):bank.baseUrl;
 const task=Promise.all(Object.entries(bank.urls).map(async ([pitch,file])=>{
  try{
   const response=await fetch(base+file,{signal:AbortSignal.timeout(20000)});
   if(!response.ok)return undefined;
   const bytes=await response.arrayBuffer(),loop=readWavLoop(bytes);
   // Do not invent loop points for unmarked recordings.
   if(!loop)return undefined;
   const buffer=await ctx.decodeAudioData(bytes);
   if(loop.start<0||loop.end>buffer.duration||loop.end-loop.start<0.08)return undefined;
   return {pitch:midi(pitch),buffer,...loop};
  }catch{return undefined;}
 })).then(results=>{const samples=results.filter((s):s is Sample=>s!==undefined);ready.set(key,samples);if(!samples.length)banks.delete(key);return samples;});
 banks.set(key,task);return task;
}
export function playArcoSustain(ctx:AudioContext,inst:string,pitch:number,duration:number,time:number,velocity:number,db:number,endVelocity=velocity):boolean{
 const samples=ready.get(family(inst));if(!samples?.length||!Number.isFinite(duration)||duration<=0)return false;
 const sample=samples.reduce((a,b)=>Math.abs(a.pitch-pitch)<=Math.abs(b.pitch-pitch)?a:b);
 if(Math.abs(sample.pitch-pitch)>3)return false;
 const start=Math.max(ctx.currentTime,time),end=start+duration,release=Math.min(.12,duration*.3);
 const source=ctx.createBufferSource(),gain=ctx.createGain(),level=ctx.createGain();
 source.buffer=sample.buffer;source.loop=true;source.loopStart=sample.start;source.loopEnd=sample.end;
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
