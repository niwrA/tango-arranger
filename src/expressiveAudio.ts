/** Native Web Audio note with continuous pitch and amplitude automation.
 * Uses the Tone-owned AudioContext for transport-synchronous timing. */
export type ExpressiveEvent={pitch:number;durationSeconds:number;velocity:number;slideTo?:number;endVelocity?:number};
export function playExpressiveEvent(ctx:AudioContext,event:ExpressiveEvent,when:number):void {
  if(!Number.isFinite(event.durationSeconds)||event.durationSeconds<=0)return;
  const start=Math.max(ctx.currentTime+0.002,when),end=start+event.durationSeconds;
  const osc=ctx.createOscillator(),gain=ctx.createGain();
  const hz=(midi:number)=>440*Math.pow(2,(midi-69)/12);
  const initial=Math.max(0.001,Math.min(0.17,0.14*event.velocity/127));
  const final=Math.max(0.001,Math.min(0.17,0.14*(event.endVelocity??event.velocity)/127));
  osc.type='triangle';osc.frequency.setValueAtTime(hz(event.pitch),start);
  if(event.slideTo!==undefined&&event.slideTo!==event.pitch){
    osc.frequency.setValueAtTime(hz(event.pitch),start+event.durationSeconds*0.12);
    osc.frequency.exponentialRampToValueAtTime(hz(event.slideTo),start+event.durationSeconds*0.92);
  }
  gain.gain.setValueAtTime(0,start);
  gain.gain.linearRampToValueAtTime(initial,start+Math.min(0.014,event.durationSeconds*0.1));
  gain.gain.linearRampToValueAtTime(final,start+event.durationSeconds*0.87);
  gain.gain.linearRampToValueAtTime(0.0001,end);
  osc.connect(gain);gain.connect(ctx.destination);
  osc.onended=()=>{osc.disconnect();gain.disconnect();};
  osc.start(start);osc.stop(end+0.008);
}
