/** Measure-wide hand-position suggestions for violin and contrabass.
 * Chromatic schematic only: no inferred bowing, stretches, shifts inside a
 * measure, or guaranteed fingerboard mechanics. Bass uses Simandl-like 1-2-4
 * below thumb position and T-1-2-3 in thumb position.
 */
import {fingerboardStrings} from './stringFingerboard';
export type PositionInstrument='Violin'|'Contrabass';
export type GuideFinger='0'|'1'|'2'|'3'|'4'|'T';
export interface PositionFingering {pitch:number;openMidi:number;offset:number;finger:GuideFinger}
export interface StringPositionGuide {
 instrument:PositionInstrument;
 position:string;
 ordinal:number;
 firstFingerOffset:number;
 firstStop:number;
 lastStop:number;
 thumb:boolean;
 fingerings:PositionFingering[];
 anchorStringMidi:number;
 anchorMidi:number;
}
export interface PositionNote {pitch:number;start?:number;duration?:number}
type Position={label:string;first:number;thumb?:boolean};
const violin:Position[]=[
 {label:'I',first:2},{label:'II',first:4},{label:'III',first:5},
 {label:'IV',first:7},{label:'V',first:9},{label:'VI',first:10},
 {label:'VII',first:12},{label:'VIII',first:14},{label:'IX',first:16},
 {label:'X',first:19},{label:'XI',first:21},{label:'XII',first:23},
 {label:'XIII',first:26},{label:'XIV',first:28}
];
const bass:Position[]=[
 {label:'½',first:1},{label:'I',first:2},{label:'II',first:3},
 {label:'II½',first:4},{label:'III',first:5},{label:'III½',first:6},
 {label:'IV',first:7},{label:'V',first:8},{label:'V½',first:9},
 {label:'VI',first:10},{label:'VI½',first:11},
 {label:'VII · thumb',first:12,thumb:true},
 {label:'Thumb + II',first:15,thumb:true},
 {label:'Thumb + IV',first:18,thumb:true},
 {label:'Thumb + VI',first:21,thumb:true},
 {label:'Thumb + VIII',first:24,thumb:true}
];
/** Unambiguous conservative finger options. Offsets are semitones above the string. */
export function fingerAtPosition(instrument:PositionInstrument,first:number,offset:number,thumb=false):GuideFinger|null{
 if(!Number.isInteger(offset)||offset<0)return null;
 if(offset===0)return '0';
 const distance=offset-first;
 if(instrument==='Contrabass'){
  if(thumb)return (['T','1','2','3'] as GuideFinger[])[distance]??null;
  return (['1','2','4'] as GuideFinger[])[distance]??null;
 }
 if(distance===-1||distance===0)return '1';
 if(distance===1||distance===2)return '2';
 if(distance===3||distance===4)return '3';
 if(distance===5)return '4';
 return null;
}
/** Keep each hand-position window fixed at 8 columns, including on an iPad. */
export function positionWindow(guide:StringPositionGuide):number[]{
 return Array.from({length:8},(_,i)=>guide.firstStop+i);
}
export function suggestStringMeasurePosition(instrument:PositionInstrument,raw:readonly PositionNote[]):StringPositionGuide|null{
 const notes=raw.filter(n=>Number.isInteger(n.pitch)&&n.pitch>=0&&n.pitch<=127)
  .slice().sort((a,b)=>(a.start??0)-(b.start??0)||a.pitch-b.pitch);
 if(!notes.length)return null;
 const strings=fingerboardStrings(instrument);
 const positions=instrument==='Violin'?violin:bass;
 let best:StringPositionGuide|null=null,bestScore=-Infinity;
 for(let index=0;index<positions.length;index++){
  const pos=positions[index];
  const assignments:PositionFingering[]=[];
  let covered=0,score=-index*2.5,priorString:number|null=null;
  for(const note of notes){
   const options:PositionFingering[]=[];
   for(const string of strings){
    const offset=note.pitch-string.midi;
    if(offset<0)continue;
    const finger=fingerAtPosition(instrument,pos.first,offset,Boolean(pos.thumb));
    if(finger!==null)options.push({pitch:note.pitch,openMidi:string.midi,offset,finger});
   }
   options.sort((a,b)=>{
    const quality=(item:PositionFingering)=>
      (item.finger==='0'?-12:0) +
      (priorString!==null&&item.openMidi!==priorString?2:0) +
      (item.offset===pos.first?0:Math.abs(item.offset-pos.first)*.35) -
      item.openMidi*.018;
    return quality(a)-quality(b);
   });
   const chosen=options[0];
   const weight=Math.max(1,Math.min(4,Number.isFinite(note.duration)?note.duration!:1));
   if(!chosen){score-=8*weight;continue;}
   covered++;
   score+=50+weight*7+(chosen.finger==='0'?3:0);
   if(priorString!==null&&priorString!==chosen.openMidi)score-=2;
   priorString=chosen.openMidi;
   if(!assignments.some(item=>item.pitch===chosen.pitch))assignments.push(chosen);
  }
  if(!covered)continue;
  const firstStop=Math.max(0,pos.first-1);
  const stopped=assignments.filter(f=>f.finger!=='0');
  const byString=new Map<number,number>();
  for(const note of notes){
   const finger=assignments.find(a=>a.pitch===note.pitch);
   if(finger&&finger.finger!=='0')byString.set(finger.openMidi,(byString.get(finger.openMidi)??0)+1);
  }
  const anchorStringMidi=[...strings].sort((a,b)=>
    (byString.get(b.midi)??0)-(byString.get(a.midi)??0)||b.midi-a.midi
  )[0]?.midi??strings[0].midi;
  const result:StringPositionGuide={
   instrument,position:pos.label,ordinal:index,
   firstFingerOffset:pos.first,firstStop,lastStop:firstStop+7,
   thumb:Boolean(pos.thumb),fingerings:assignments,
   anchorStringMidi,anchorMidi:anchorStringMidi+pos.first
  };
  if(score>bestScore){best=result;bestScore=score;}
 }
 return best;
}
