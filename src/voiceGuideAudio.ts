import type {ExpressiveEvent} from './expressiveAudio';

type GuideOptions={
 gainDb?:number;
 referenceHz?:number;
 destination?:AudioNode;
 held?:boolean;
 /** Learn can keep the tuning target straight unless vibrato was written. */
 vibrato?:boolean;
};
export type VoiceGuideHandle={release:(when?:number)=>void;stop:()=>void;setGainDb:(db:number)=>void};
type RunningGuide={part:string;voice:VoiceGuideHandle};
type GuideCache={wave:PeriodicWave;breath:AudioBuffer;active:Set<RunningGuide>};
type Stage={time:number;level:number};

export function isVoiceGuidePart(part:string):boolean{return part==='Voice'||part.startsWith('Voice ');}
export function usesModeledAudio(part:string):boolean{return isVoiceGuidePart(part)||part.startsWith('Bandoneon');}

const caches=new WeakMap<BaseAudioContext,GuideCache>();
const clamp=(x:number,lo:number,hi:number)=>Math.min(hi,Math.max(lo,x));
const decibels=(db:number)=>10**(clamp(Number.isFinite(db)?db:0,-60,18)/20);
function cacheFor(ctx:BaseAudioContext){
 let cache=caches.get(ctx);
 if(cache)return cache;
 // Rounded, asymmetric glottal pulse. Frequencies stay at the written pitch;
 // a separate, mostly fixed vocal-tract filter creates the vowel.
 const real=new Float32Array(41),imag=new Float32Array(real.length);
 for(let i=1;i<real.length;i++){
  const amplitude=1/Math.pow(i,1.17);
  const phase=-.28*Math.log2(i);
  real[i]=amplitude*Math.sin(phase);
  imag[i]=amplitude*Math.cos(phase);
 }
 const breath=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*.14),ctx.sampleRate);
 const noise=breath.getChannelData(0);
 let seed=252151;
 for(let i=0;i<noise.length;i++){
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  noise[i]=seed/2147483648-1;
 }
 cache={wave:ctx.createPeriodicWave(real,imag),breath,active:new Set()};
 caches.set(ctx,cache);
 return cache;
}
function levelAt(stages:readonly Stage[],when:number):number{
 for(let i=1;i<stages.length;i++){
  const [a,b]=[stages[i-1],stages[i]];
  if(when<=b.time)return a.level+(b.level-a.level)*clamp((when-a.time)/Math.max(1e-6,b.time-a.time),0,1);
 }
 return stages[stages.length-1].level;
}
export function stopVoiceGuide(ctx:BaseAudioContext,matches:(part:string)=>boolean=()=>true){
 caches.get(ctx)?.active.forEach(entry=>{if(matches(entry.part))entry.voice.stop();});
}
export function setVoiceGuideGain(ctx:BaseAudioContext,part:string,gainDb:number){
 caches.get(ctx)?.active.forEach(entry=>{if(entry.part===part)entry.voice.setGainDb(gainDb);});
}

/** Sample-free sung “ah”, not a speech, phoneme or lyric renderer. */
export function playVoiceGuide(ctx:BaseAudioContext,part:string,event:ExpressiveEvent,when:number,options:GuideOptions={}):VoiceGuideHandle|undefined{
 if(ctx.state==='closed'||!Number.isFinite(event.pitch)||event.pitch<0||event.pitch>127||
    !Number.isFinite(event.durationSeconds)||event.durationSeconds<=0)return;
 const paths=event.gesture?[event.gesture.points,...(event.gesture.partner?.length?[event.gesture.partner]:[])]:
  [[{at:0,pitch:event.pitch},{at:1,pitch:event.slideTo??event.pitch}]];
 if(paths.some(points=>points.length<2||points.some((p,i)=>!Number.isFinite(p.pitch)||p.pitch<0||p.pitch>127||
  !Number.isFinite(p.at)||p.at<0||p.at>1||(i>0&&p.at<=points[i-1].at))))return;
 const cache=cacheFor(ctx);
 const start=Number.isFinite(when)?Math.max(when,ctx.currentTime):ctx.currentTime;
 const duration=Math.max(.025,event.durationSeconds),end=start+duration;
 const amplitude=(v:number)=>Math.pow(clamp(Number.isFinite(v)?v:80,1,127)/127,1.23);
 const initial=amplitude(event.velocity),final=amplitude(event.endVelocity??event.velocity);
 const referenceHz=typeof options.referenceHz==='number'&&Number.isFinite(options.referenceHz)&&options.referenceHz>0?options.referenceHz:440;
 const hz=(pitch:number)=>Math.min(ctx.sampleRate*.42,referenceHz*Math.pow(2,(pitch-69)/12));
 const mix=ctx.createGain();
 mix.gain.value=decibels(options.gainDb??0);
 mix.connect(options.destination??ctx.destination);
 const sources:AudioScheduledSourceNode[]=[],oscillators:OscillatorNode[]=[];
 const nodes:AudioNode[]=[mix];
 const envelopes:{param:AudioParam;stages:Stage[]}[]=[];
 let stopAt=options.held?Infinity:end+.096,ended=0,disposed=false;
 const voice:VoiceGuideHandle={
  release:when=>finish(Number.isFinite(when)?Math.max(ctx.currentTime,when!):ctx.currentTime,.078),
  stop:()=>finish(ctx.currentTime,.014),
  setGainDb:db=>{if(!disposed&&Number.isFinite(db))mix.gain.setTargetAtTime(decibels(db),ctx.currentTime,.014);}
 };
 const entry={part,voice};
 function finish(at:number,tail:number){
  if(disposed||ctx.state==='closed'||at+tail>=stopAt)return;
  if(at<start){mix.gain.cancelScheduledValues(at);mix.gain.setValueAtTime(0,at);stopAt=at;}
  else{
   stopAt=at+tail;
   for(const {param,stages} of envelopes){
    const level=levelAt(stages,at);
    param.cancelScheduledValues(at);
    if(at>ctx.currentTime&&stages.some(s=>s.time>=at))param.linearRampToValueAtTime(level,at);
    else param.setValueAtTime(level,at);
    param.linearRampToValueAtTime(0,stopAt);
    while(stages.length&&stages[stages.length-1].time>=at)stages.pop();
    stages.push({time:at,level},{time:stopAt,level:0});
   }
  }
  for(const node of oscillators)node.stop(stopAt+.006);
  // The aspiration is brief anyway; it runs through the same release envelope.
  if(at<start)for(const node of sources)if(!oscillators.includes(node as OscillatorNode))node.stop(at);
 }
 cache.active.add(entry);
 for(const points of paths){
  const tongue=ctx.createOscillator(),vocal=ctx.createGain();
  const attack=Math.min(duration*.28,.065-.024*initial),settle=Math.min(duration*.18,.095);
  // The first resonance meets the fundamental in the high register. Trim
  // that broad boost gradually, without a note-to-note timbre switch.
  const treble=clamp((points[0].pitch-72)/9,0,1);
  const level=.33/((1+1.22*treble*treble*(3-2*treble))*paths.length);
  const swell=Math.max(start+attack+settle,end-Math.min(.07,duration*.15));
  const stages=[{time:start,level:0},{time:start+attack,level:level*initial*1.06},
   {time:start+attack+settle,level:level*initial}];
  if(event.endVelocity!==undefined)stages.push({time:swell,level:level*final});
  if(!options.held)stages.push({time:end,level:level*final},{time:end+.087,level:0});
  vocal.gain.setValueAtTime(0,start);
  for(const s of stages.slice(1))vocal.gain.linearRampToValueAtTime(s.level,s.time);
  envelopes.push({param:vocal.gain,stages});vocal.connect(mix);

  tongue.setPeriodicWave(cache.wave);
  tongue.frequency.setValueAtTime(hz(points[0].pitch),start);
  for(const point of points.slice(1))tongue.frequency.exponentialRampToValueAtTime(hz(point.pitch),start+duration*point.at);
  const f0=hz(points[0].pitch),register=clamp((points[0].pitch-52)/34,0,1);
  // Keep resonances mostly independent of note pitch. Open the first vowel
  // resonance towards F0 in the top register so high notes do not disappear.
  const centers=[Math.max(630+210*register,1.05*f0),1230+255*register,2550+365*register];
  const bandwidth=[165,230,410],resonanceLevels=[.82,.65,.32];
  const foundation=ctx.createBiquadFilter(),core=ctx.createGain();
  foundation.type='lowpass';foundation.Q.value=.2;
  foundation.frequency.value=Math.max(380,f0*1.4);core.gain.value=.32;
  tongue.connect(foundation);foundation.connect(core);core.connect(vocal);
  nodes.push(tongue,vocal,foundation,core);
  for(let i=0;i<centers.length;i++){
   const filter=ctx.createBiquadFilter(),resonance=ctx.createGain();
   filter.type='bandpass';filter.Q.value=centers[i]/bandwidth[i];
   const center=Math.min(ctx.sampleRate*.42,centers[i]);
   filter.frequency.setValueAtTime(center*(i===0?.87:.95),start);
   filter.frequency.linearRampToValueAtTime(center,start+attack+settle);
   resonance.gain.setValueAtTime(resonanceLevels[i]*(.85+.15*initial),start);
   if(event.endVelocity!==undefined)resonance.gain.linearRampToValueAtTime(resonanceLevels[i]*(.85+.15*final),swell);
   tongue.connect(filter);filter.connect(resonance);resonance.connect(vocal);nodes.push(filter,resonance);
  }
  sources.push(tongue);oscillators.push(tongue);
  if(duration>=.1){
   const breath=ctx.createBufferSource(),air=ctx.createBiquadFilter(),airGain=ctx.createGain();
   breath.buffer=cache.breath;air.type='bandpass';air.frequency.value=1450;air.Q.value=.72;
   airGain.gain.setValueAtTime(.055*(.65+.35*initial),start);
   airGain.gain.exponentialRampToValueAtTime(.0001,start+.12);
   breath.connect(air);air.connect(airGain);airGain.connect(vocal);
   nodes.push(breath,air,airGain);sources.push(breath);
  }
  if(options.vibrato!==false&&duration>=.68){
   const lfo=ctx.createOscillator(),depth=ctx.createGain();
   const delayed=start+Math.min(.45,duration*.53);
   lfo.frequency.value=5.35;
   depth.gain.setValueAtTime(0,start);depth.gain.setValueAtTime(0,delayed);
   depth.gain.linearRampToValueAtTime(12,delayed+Math.min(.22,duration*.23));
   lfo.connect(depth);depth.connect(tongue.detune);
   nodes.push(lfo,depth);sources.push(lfo);oscillators.push(lfo);
  }
 }
 for(const source of sources){
  source.onended=()=>{
   if(++ended!==sources.length)return;
   disposed=true;cache.active.delete(entry);
   for(const node of nodes)node.disconnect();
  };
  source.start(start);
 }
 if(!options.held)for(const node of oscillators)node.stop(stopAt);
 return voice;
}
