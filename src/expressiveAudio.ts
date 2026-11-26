/** Native Web Audio: multi-point pitch trajectories, double sirenas and swells. */
import type {Note} from './music';
import type {TangoGesture,GesturePoint} from './tangoGestures';
export type ExpressiveEvent={pitch:number;durationSeconds:number;velocity:number;slideTo?:number;endVelocity?:number;gesture?:TangoGesture;bowedTremolo?:Note['bowedTremolo'];bowedStrokeCount?:number};
export function playExpressiveEvent(ctx:AudioContext,event:ExpressiveEvent,when:number):void {
 if(!Number.isFinite(event.durationSeconds)||event.durationSeconds<=0)return;
 const start=Math.max(ctx.currentTime+0.002,when),end=start+event.durationSeconds;
 const hz=(midi:number)=>440*Math.pow(2,(midi-69)/12);
 const initial=Math.max(0.001,Math.min(0.17,0.14*event.velocity/127));
 const final=Math.max(0.001,Math.min(0.17,0.14*(event.endVelocity??event.velocity)/127));
 const paths:GesturePoint[][]=event.gesture
   ?[event.gesture.points,...(event.gesture.partner?[event.gesture.partner]:[])]
   :[[{at:0,pitch:event.pitch},{at:1,pitch:event.slideTo??event.pitch}]];
 for(const points of paths){
  if(points.length<2)continue;
  const osc=ctx.createOscillator(),gain=ctx.createGain(),count=paths.length;
  osc.type='triangle';osc.frequency.setValueAtTime(hz(points[0].pitch),start);
  if(event.gesture?.kind==='latigo'&&points.length===2)
    osc.frequency.setValueAtTime(hz(points[0].pitch),start+event.durationSeconds*.52);
  else if(!event.gesture&&event.slideTo!==undefined)
    osc.frequency.setValueAtTime(hz(points[0].pitch),start+event.durationSeconds*.12);
  for(const pt of points.slice(1)){
   const at=(event.gesture?.kind==='latigo'&&pt.at===1)?0.95:pt.at;
   osc.frequency.exponentialRampToValueAtTime(hz(pt.pitch),start+event.durationSeconds*at);
  }
  gain.gain.setValueAtTime(0,start);
  gain.gain.linearRampToValueAtTime(initial/count,start+Math.min(.014,event.durationSeconds*.1));
  gain.gain.linearRampToValueAtTime(final/count,start+event.durationSeconds*.87);
  gain.gain.linearRampToValueAtTime(.0001,end);
  osc.connect(gain);
  // Preserve continuous oscillator pitch while rearticulating the bow.
  const bow=event.bowedTremolo?ctx.createGain():undefined;
  if(bow){
   gain.connect(bow);bow.connect(ctx.destination);
   const rate=event.bowedStrokeCount!==undefined?Math.max(.1,event.bowedStrokeCount/event.durationSeconds):Math.max(4,Math.min(24,event.bowedTremolo?.rateHz??14)),period=1/rate;
   bow.gain.setValueAtTime(.12,start);
   for(let t=start;t<end;t+=period){
    bow.gain.setValueAtTime(.12,t);
    bow.gain.linearRampToValueAtTime(1,Math.min(end,t+period*.18));
    if(t+period*.65<end)bow.gain.linearRampToValueAtTime(.65,t+period*.65);
    if(t+period<end)bow.gain.linearRampToValueAtTime(.12,t+period);
   }
  }else gain.connect(ctx.destination);
  let trem:OscillatorNode|undefined,tremGain:GainNode|undefined;
  if(event.gesture?.tremolo&&!bow){
    trem=ctx.createOscillator();tremGain=ctx.createGain();
    trem.frequency.value=6;tremGain.gain.value=initial/count*.22;
    trem.connect(tremGain);tremGain.connect(gain.gain);
    trem.start(start);trem.stop(end);
  }
  osc.onended=()=>{osc.disconnect();gain.disconnect();bow?.disconnect();trem?.disconnect();tremGain?.disconnect();};
  osc.start(start);osc.stop(end+.008);
 }
}
