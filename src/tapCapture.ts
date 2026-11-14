/** Live tap capture: transport-time input is quantized into written beats.
 * Pure functions here deliberately do not depend on the audio engine or DOM.
 * A take remains a draft until explicitly applied by an editor. */
export type CapturedTap={bar:number;beat:number;pitch?:number};
export type CapturedRhythm={beat:number;duration:number;accent:boolean};
const round=(n:number)=>Math.round(n*1000000)/1000000;
export function capturePosition(seconds:number,bpm:number,beats:number,first:number,last:number,step=0.25,latencyMs=0):Pick<CapturedTap,'bar'|'beat'>{
  if(!Number.isFinite(seconds)||seconds<0||!Number.isFinite(bpm)||bpm<=0||!Number.isInteger(beats)||beats<1||
    !Number.isInteger(first)||!Number.isInteger(last)||first<0||last<first||!Number.isFinite(step)||step<=0||
    !Number.isFinite(latencyMs)||latencyMs<0||latencyMs>300)throw Error('Invalid capture transport or measure range');
  const total=(last-first+1)*beats;
  const elapsed=Math.max(0,seconds-latencyMs/1000)*bpm/60;
  const tick=round(Math.round((elapsed%total)/step)*step)%total;
  return {bar:first+Math.floor(tick/beats),beat:round(tick%beats)};
}
/** Repeated passes replace a tap at the same beat/pitch instead of multiplying notes. */
export function addCapturedTap(taps:CapturedTap[],tap:CapturedTap,mode:'rhythm'|'melody'):CapturedTap[]{
  if(!Number.isInteger(tap.bar)||tap.bar<0||!Number.isFinite(tap.beat)||tap.beat<0||
    (mode==='melody'&&(!Number.isInteger(tap.pitch)||tap.pitch!<0||tap.pitch!>127)))throw Error('Invalid captured tap');
  return [...taps.filter(t=>!(t.bar===tap.bar&&Math.abs(t.beat-tap.beat)<1e-7&&
    (mode==='rhythm'||t.pitch===tap.pitch))),{...tap}];
}
/** Short taps produce a 1-beat maximum written duration; gaps remain rests.
 * Duration is always limited to the next attack or measure boundary. */
export function rhythmFromTaps(taps:CapturedTap[],bar:number,beats:number,step=0.25):CapturedRhythm[]{
  const starts=[...new Set(taps.filter(t=>t.bar===bar).map(t=>t.beat))].sort((a,b)=>a-b);
  return starts.map((beat,i)=>({beat,duration:round(Math.min(1,(starts[i+1]??beats)-beat)),accent:Number.isInteger(beat)}))
    .filter(s=>s.duration>=step-1e-7);
}
export function melodyFromTaps(taps:CapturedTap[],bar:number,beats:number,step=0.25):Array<{beat:number;duration:number;pitch:number}>{
  const ordered=taps.filter(t=>t.bar===bar&&Number.isInteger(t.pitch)).sort((a,b)=>a.beat-b.beat||a.pitch!-b.pitch!);
  const onsets=[...new Set(ordered.map(t=>t.beat))];
  return ordered.map(t=>({beat:t.beat,pitch:t.pitch!,duration:round(Math.min(1,(onsets.find(b=>b>t.beat+1e-7)??beats)-t.beat))}))
    .filter(t=>t.duration>=step-1e-7);
}
