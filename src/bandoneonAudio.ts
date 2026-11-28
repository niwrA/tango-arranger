import type {ExpressiveEvent} from './expressiveAudio';
import type {BellowsDirection} from './bandoneonLayout';
import type {GesturePoint} from './tangoGestures';

export type BandoneonHand='left'|'right';
export type BandoneonVoice={
 release:(when?:number)=>void;
 stop:(when?:number)=>void;
 setGainDb:(db:number,when?:number)=>void;
};
type BandoneonOptions={
 gainDb?:number;
 hand?:BandoneonHand;
 referenceHz?:number;
 destination?:AudioNode;
 held?:boolean;
 direction?:BellowsDirection;
 pressure?:number;
};

// Two free reeds an octave apart, not two wet-detuned accordion voices.
// Different harmonic balances model the low/high reeds before the hand/register filter.
const lowPartials=[1,.22,.32,.12,.14,.075,.058,.032,.023,.017];
const highPartials=[1,.15,.24,.12,.07,.047,.026,.016];
const waveCache=new WeakMap<BaseAudioContext,[PeriodicWave,PeriodicWave]>();
function reedWaves(ctx:BaseAudioContext):[PeriodicWave,PeriodicWave]{
 const previous=waveCache.get(ctx);
 if(previous)return previous;
 const make=(coefficients:number[],phase:number)=>{
  const real=new Float32Array(coefficients.length+1),imag=new Float32Array(real.length);
  coefficients.forEach((v,i)=>{
   const n=i+1;
   real[n]=v*Math.sin(phase*n);
   imag[n]=v*Math.cos(phase*n);
  });
  return ctx.createPeriodicWave(real,imag,{disableNormalization:true});
 };
 const pair:[PeriodicWave,PeriodicWave]=[make(lowPartials,0),make(highPartials,.22)];
 waveCache.set(ctx,pair);
 return pair;
}
function clamp(x:number,min:number,max:number){return Math.max(min,Math.min(max,x));}
function commandTime(ctx:BaseAudioContext,when?:number){
 return typeof when==='number'&&Number.isFinite(when)?Math.max(ctx.currentTime,when):ctx.currentTime;
}
function adjustment(db:number){return 10**(clamp(Number.isFinite(db)?db:0,-60,18)/20);}
function pitchHz(pitch:number,referenceHz:number){return referenceHz*2**((pitch-69)/12);}
function dynamics(velocity:number){return (clamp(Number.isFinite(velocity)?velocity:80,1,127)/127)**1.25;}
function validPoint(p:GesturePoint){return Number.isFinite(p.at)&&p.at>=0&&p.at<=1&&Number.isFinite(p.pitch)&&p.pitch>=0&&p.pitch<=127;}

type Stage={time:number;level:number};
function levelAt(stages:Stage[],when:number):number{
 const first=stages[0];
 if(when<=first.time)return first.level;
 for(let i=1;i<stages.length;i++){
  const b=stages[i],a=stages[i-1];
  if(when<=b.time)return b.time===a.time?b.level:a.level+(b.level-a.level)*(when-a.time)/(b.time-a.time);
 }
 return stages[stages.length-1].level;
}

type TrackedVoice={instrument:string;voice:BandoneonVoice};
// A closed practice/offline context may never dispatch onended. Contexts and
// their voices must remain collectable even when a native callback is lost.
const activeVoices=new WeakMap<BaseAudioContext,Set<TrackedVoice>>();
export function stopBandoneonVoices(ctx:BaseAudioContext,predicate:(instrument:string)=>boolean=()=>true){
 activeVoices.get(ctx)?.forEach(v=>{if(predicate(v.instrument))v.voice.stop();});
}
export function setBandoneonGain(ctx:BaseAudioContext,instrument:string,db:number){
 activeVoices.get(ctx)?.forEach(v=>{if(v.instrument===instrument)v.voice.setGainDb(db);});
}

export function playBandoneonNote(ctx:BaseAudioContext,instrument:string,event:ExpressiveEvent,when:number,options:BandoneonOptions={}):BandoneonVoice|undefined{
 if(ctx.state==='closed'||!Number.isFinite(event.pitch)||event.pitch<0||event.pitch>127||
    !Number.isFinite(event.durationSeconds)||event.durationSeconds<=0)return;
 const start=commandTime(ctx,when);
 const duration=Math.max(.014,event.durationSeconds),end=start+duration;
 const referenceHz=typeof options.referenceHz==='number'&&Number.isFinite(options.referenceHz)&&options.referenceHz>0?options.referenceHz:440;
 const paths=event.gesture?.points.length
  ?[event.gesture.points,...(event.gesture.partner?.length?[event.gesture.partner]:[])]
  :[[{at:0,pitch:event.pitch},{at:1,pitch:event.slideTo??event.pitch}]];
 if(paths.some(points=>points.length<2||points.some((p,i)=>!validPoint(p)||(i>0&&p.at<=points[i-1].at))))return;
 const held=options.held===true;
 const push=options.direction==='push';
 const pressureScale=clamp(Number.isFinite(options.pressure)?options.pressure!:1,.05,1.5);
 const [lowWave,highWave]=reedWaves(ctx);
 const trackedVoices=activeVoices.get(ctx)??new Set<TrackedVoice>();
 activeVoices.set(ctx,trackedVoices);

 const output=ctx.createGain();
 output.gain.value=adjustment(options.gainDb??0);
 output.connect(options.destination??ctx.destination);
 const oscillators:OscillatorNode[]=[];
 const cleanupNodes:AudioNode[]=[output];
 const bellows: {param:AudioParam;stages:Stage[]}[]=[];
 let outputLevels:Stage[]=[{time:ctx.currentTime,level:adjustment(options.gainDb??0)}];
 const quick=event.bellowsQuickRelease===true;
 let stopAt=held?Infinity:end+(quick?.013:.095);
 let tracked:TrackedVoice;
 let ended=0,disposed=false;
 const dispose=()=>{
  if(disposed)return;
  disposed=true;
  trackedVoices.delete(tracked);
  for(const node of cleanupNodes)node.disconnect();
 };
 const voice:BandoneonVoice={
  release:when=>finish(commandTime(ctx,when),.065),
  stop:when=>finish(commandTime(ctx,when),.012),
  setGainDb:(db,when)=>{
   if(disposed||!Number.isFinite(db))return;
   const t=commandTime(ctx,when);
   const value=adjustment(db),previous=levelAt(outputLevels,t);
   output.gain.cancelScheduledValues(t);
   if(t>ctx.currentTime&&outputLevels.some(stage=>stage.time>=t))
    output.gain.linearRampToValueAtTime(previous,t);
   else output.gain.setValueAtTime(previous,t);
   output.gain.linearRampToValueAtTime(value,t+.018);
   outputLevels=[...outputLevels.filter(stage=>stage.time<t&&stage.time>=ctx.currentTime),{time:t,level:previous},{time:t+.018,level:value}];
  }
 };
 function finish(at:number,tail:number){
  if(disposed||at+tail>=stopAt)return;
  if(at<start){
   // Releasing before the voice starts must not let a queued attack leak.
   output.gain.cancelScheduledValues(at);
   output.gain.setValueAtTime(0,at);
   stopAt=at;
  }else{
   stopAt=at+tail;
   for(const {param,stages} of bellows){
    const previous=levelAt(stages,at);
    param.cancelScheduledValues(at);
    // Rebuild the cancelled ramp endpoint explicitly for Safari (no
    // dependency on optional AudioParam.cancelAndHoldAtTime).
    if(at>ctx.currentTime&&stages.some(s=>s.time>=at))
      param.linearRampToValueAtTime(previous,at);
    else param.setValueAtTime(previous,at);
    param.linearRampToValueAtTime(0,stopAt);
    while(stages.length&&stages[stages.length-1].time>=at)stages.pop();
    stages.push({time:at,level:previous},{time:stopAt,level:0});
   }
  }
  for(const oscillator of oscillators)oscillator.stop(stopAt+.004);
 }
 tracked={instrument,voice};
 trackedVoices.add(tracked);
 for(const points of paths){
  const root=points[0].pitch;
  const left=options.hand?options.hand==='left':root<60;
  const register=clamp((root-36)/55,0,1);
  const initial=dynamics(event.velocity),final=dynamics(event.endVelocity??event.velocity);
  const attack=Math.min(duration*.24,((left ? .024 : .017)-.006*initial)*(push?.84:1));
  const settle=Math.min(duration*.19,.055);
  const level=.135*(1-.20*register)*pressureScale*(push?.96:1)/paths.length;
  // Envelope tracks bellows pressure without killing the held tone.
  const stages:Stage[]=[
   {time:start,level:0},
   {time:start+attack,level:level*initial*1.08},
   {time:start+attack+settle,level:level*initial},
  ];
  const swellTime=Math.max(start+attack+settle,end-Math.min(.04,duration*.14));
  if(event.endVelocity!==undefined)stages.push({time:swellTime,level:level*final});
  if(!held){
   stages.push({time:end,level:level*final},{time:end+(quick?.008:.086),level:0});
  }

  const fundamental=ctx.createOscillator(),octave=ctx.createOscillator();
  const low=ctx.createGain(),high=ctx.createGain(),filter=ctx.createBiquadFilter(),pressure=ctx.createGain();
  fundamental.setPeriodicWave(lowWave);octave.setPeriodicWave(highWave);
  low.gain.value=left ? .90 : .82;
  high.gain.value=(left ? .34 : .48)*(.95-.14*register)*(push?1.12:1);
  filter.type='lowpass';filter.Q.value=left ? .30 : .48;
  const cutoff=(left?1750:2650)+(left?1500:1950)*register;
  const filterAt=(pressure:number)=>Math.min(ctx.sampleRate*.45,cutoff*(.78+.46*pressure)*(push?1.08:1));
  filter.frequency.setValueAtTime(filterAt(initial*pressureScale),start);
  if(event.endVelocity!==undefined)filter.frequency.linearRampToValueAtTime(filterAt(final*pressureScale),swellTime);
  for(const [oscillator,ratio] of [[fundamental,1],[octave,2]] as const){
   const hz=(p:number)=>Math.min(ctx.sampleRate*.225,pitchHz(p,referenceHz))*ratio;
   oscillator.frequency.setValueAtTime(hz(root),start);
   if(event.gesture?.kind==='latigo'&&points.length===2)
    oscillator.frequency.setValueAtTime(hz(root),start+duration*.52);
   else if(!event.gesture&&event.slideTo!==undefined)
    oscillator.frequency.setValueAtTime(hz(root),start+duration*.12);
   for(const point of points.slice(1)){
    const fraction=event.gesture?.kind==='latigo'&&point.at===1?.95:point.at;
    oscillator.frequency.exponentialRampToValueAtTime(hz(point.pitch),start+duration*fraction);
   }
  }
  pressure.gain.setValueAtTime(0,start);
  for(const stage of stages.slice(1))pressure.gain.linearRampToValueAtTime(stage.level,stage.time);
  bellows.push({param:pressure.gain,stages});

  fundamental.connect(low);octave.connect(high);low.connect(filter);high.connect(filter);
  filter.connect(pressure);
  const shakeRate=Number.isFinite(event.bellowsShake)&&event.bellowsShake!>0?clamp(event.bellowsShake!,3,12):event.gesture?.tremolo?7:0;
  if(shakeRate){
   // Modulate shared bellows pressure; do not convert tremolo into pitch wobble.
   const shake=ctx.createGain();
   pressure.connect(shake);shake.connect(output);
   shake.gain.setValueAtTime(1,start);
   const period=1/shakeRate,turns=Math.min(240,Math.ceil(duration/period));
   for(let i=0;i<turns;i++){
    if((i+.5)*period<duration)shake.gain.linearRampToValueAtTime(event.bellowsShake?.55:.67,start+(i+.5)*period);
    if((i+1)*period<duration)shake.gain.linearRampToValueAtTime(1,start+(i+1)*period);
   }
   cleanupNodes.push(shake);
  }else pressure.connect(output);
  cleanupNodes.push(low,high,filter,pressure);
  oscillators.push(fundamental,octave);
  for(const oscillator of [fundamental,octave]){
   cleanupNodes.push(oscillator);
   oscillator.onended=()=>{if(++ended===oscillators.length)dispose();};
   oscillator.start(start);
   if(!held)oscillator.stop(stopAt);
  }
 }
 return voice;
}
