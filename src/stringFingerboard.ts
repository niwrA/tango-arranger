/** Shared schematic string rows, top-to-bottom as displayed. */
export interface FingerboardString {name:string;midi:number}
export const MAX_VISUAL_FRET=24;
export function fingerboardStrings(inst:string):readonly FingerboardString[]{
 if(inst.startsWith('Violin'))return [{name:'E5',midi:76},{name:'A4',midi:69},{name:'D4',midi:62},{name:'G3',midi:55}];
 if(inst==='Contrabass')return [{name:'E1',midi:28},{name:'A1',midi:33},{name:'D2',midi:38},{name:'G2',midi:43}];
 if(inst.startsWith('Guitar'))return [{name:'E2',midi:40},{name:'A2',midi:45},{name:'D3',midi:50},{name:'G3',midi:55},{name:'B3',midi:59},{name:'E4',midi:64}];
 return [];
}
/** A chromatic window; step widths are not physical neck distances. */
export function visibleFingerboardFrets(first:number,count:number):number[]{
 if(!Number.isInteger(first)||!Number.isInteger(count)||count<1||count>MAX_VISUAL_FRET+1)
  throw Error('Invalid fingerboard window');
 const start=Math.max(0,Math.min(first,MAX_VISUAL_FRET+1-count));
 return Array.from({length:count},(_,i)=>start+i);
}
export function fingerboardMidi(openMidi:number,fret:number,range:[number,number]):number|null{
 const pitch=openMidi+fret;
 return Number.isInteger(openMidi)&&Number.isInteger(fret)&&fret>=0&&fret<=MAX_VISUAL_FRET
  &&pitch>=range[0]&&pitch<=range[1]&&pitch>=0&&pitch<=127?pitch:null;
}
