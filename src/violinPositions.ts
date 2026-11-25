/** Deterministic, introductory violin hand-position suggestions.
 * These are schematic CONCERT-pitch targets, not a fingering prescription.
 * A musician may choose a different string, extension or position for phrasing. */
export const VIOLIN_OPEN_STRINGS=[
 {name:'G',midi:55},{name:'D',midi:62},{name:'A',midi:69},{name:'E',midi:76}
] as const;
const POSITIONS=[
 {roman:'I',firstFinger:2,firstStop:0,lastStop:7},
 {roman:'III',firstFinger:5,firstStop:5,lastStop:12},
 {roman:'V',firstFinger:9,firstStop:9,lastStop:16},
 {roman:'VII',firstFinger:12,firstStop:12,lastStop:19},
 {roman:'IX',firstFinger:16,firstStop:16,lastStop:23},
 {roman:'XI',firstFinger:21,firstStop:21,lastStop:28},
 {roman:'XIII',firstFinger:26,firstStop:26,lastStop:33}
] as const;
export interface ViolinPosition {
 stringName:'G'|'D'|'A'|'E';
 openMidi:number;
 position:string;
 positionIndex:number;
 firstStop:number;
 lastStop:number;
 midi:number;
 semitonesAboveOpen:number;
 finger:number;
}
export function suggestViolinPosition(midi:number,openMidi?:number):ViolinPosition|null {
 if(!Number.isInteger(midi)||midi<55||midi>109)return null;
 const candidates: {suggestion:ViolinPosition;weight:number}[]=[];
 VIOLIN_OPEN_STRINGS.forEach((string,stringIndex)=>{
  if(openMidi!==undefined&&openMidi!==string.midi)return;
  const offset=midi-string.midi;
  if(offset<0)return;
  POSITIONS.forEach((pos,index)=>{
   if(offset<pos.firstStop||offset>pos.lastStop)return;
   const thresholds=[pos.firstFinger,pos.firstFinger+2,pos.firstFinger+4,pos.firstFinger+7];
   let finger=1;
   if(offset!==0){
    let bestDistance=Infinity;
    thresholds.forEach((t,i)=>{const distance=Math.abs(offset-t);if(distance<bestDistance){bestDistance=distance;finger=i+1;}});
   }else finger=0;
   const weight=index*100+(3-stringIndex)*4+(offset===0?-20:0)+offset*.05;
   candidates.push({weight,suggestion:{
    stringName:string.name,openMidi:string.midi,position:pos.roman,positionIndex:index,
    firstStop:pos.firstStop,lastStop:pos.lastStop,midi,semitonesAboveOpen:offset,finger
   }});
  });
 });
 candidates.sort((a,b)=>a.weight-b.weight);
 return candidates[0]?.suggestion??null;
}
export function violinStopOffsets(suggestion:ViolinPosition|null):number[] {
 const base=suggestion?.firstStop??0;
 return Array.from({length:8},(_,i)=>base+i);
}
