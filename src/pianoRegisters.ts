/** Shared keyboard geometry for a standard 88-key piano (A0 to C8).
 * Display ranges are viewports, never limits on stored score pitches. */
export const PIANO_LOW=21;
export const PIANO_HIGH=108;
const WHITE_PCS=new Set([0,2,4,5,7,9,11]);
export const PIANO_WHITES=Array.from({length:PIANO_HIGH-PIANO_LOW+1},(_,i)=>PIANO_LOW+i)
 .filter(p=>WHITE_PCS.has(p%12));
export type PianoRegister='upper'|'lower'|'all';
export type PianoWindow={whites:number[];blacks:{pitch:number;left:number}[];start:number;end:number};
function clamp(n:number,lo:number,hi:number){return Math.max(lo,Math.min(hi,n));}
function whiteIndexNear(pitch:number):number {
 let chosen=0,best=Infinity;
 for(let i=0;i<PIANO_WHITES.length;i++){
  const distance=Math.abs(PIANO_WHITES[i]-pitch);
  if(distance<best){best=distance;chosen=i;}
 }
 return chosen;
}
export function pianoWindow(
 pitches:readonly number[],register:PianoRegister='all',split=60,whiteCount=21,lockedStart?:number
):PianoWindow{
 const count=clamp(Math.round(whiteCount),1,PIANO_WHITES.length);
 const allowed=pitches.filter(p=>Number.isInteger(p)&&p>=PIANO_LOW&&p<=PIANO_HIGH
  &&(register==='all'||(register==='upper'?p>=split:p<split)));
 const fallback=register==='upper'?72:register==='lower'?48:60;
 const target=allowed.length?(Math.min(...allowed)+Math.max(...allowed))/2:fallback;
 const first=lockedStart===undefined
  ?clamp(whiteIndexNear(target)-Math.floor((count-1)/2),0,PIANO_WHITES.length-count)
  :clamp(whiteIndexNear(lockedStart),0,PIANO_WHITES.length-count);
 const whites=PIANO_WHITES.slice(first,first+count);
 const blacks=whites.flatMap((note,index)=>
  index<whites.length-1&&whites[index+1]-note===2
   ?[{pitch:note+1,left:(index+1)/whites.length*100}]:[]);
 return {whites,blacks,start:whites[0],end:whites[whites.length-1]};
}
export function movePianoWindow(start:number,deltaSemitones:number,count=21):number{
 return pianoWindow([], 'all',60,count,start+deltaSemitones).start;
}
/** Fit as many 38px touch targets as the available width permits; don't
 * automatically expose 88 unreadably tiny keys on narrow iPad screens. */
export function autoPianoCaptureRange(
 selected:number,limits:readonly [number,number],widthPx:number,minKeyPx=38
):{start:number;end:number}{
 const low=clamp(Math.round(limits[0]),0,127),high=clamp(Math.round(limits[1]),low,127);
 const maximum=high-low+1;
 const count=clamp(Math.floor((Number.isFinite(widthPx)?widthPx:456)/minKeyPx),1,maximum);
 const selectedPitch=clamp(Math.round(selected),low,high);
 const start=clamp(selectedPitch-Math.floor((count-1)/2),low,high-count+1);
 return {start,end:start+count-1};
}
