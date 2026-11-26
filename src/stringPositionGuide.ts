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
export interface PositionNote {pitch:number;start?:number;duration?:number;stringMidi?:number;lockString?:boolean}
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
  // For tango bass, prefer a practical first-finger position rather than
  // the lowest possible position at the expense of repeated fourth fingers.
  // Coverage still dominates: do not omit notes merely to avoid finger 4.
  const isBass=instrument==='Contrabass';
  const fingerCost=(finger:GuideFinger)=>isBass?({'0':0,'1':0,'2':5,'4':11,'T':8,'3':12}[finger]):0;
  let covered=0,score=-index*(isBass?2:6)-(isBass&&pos.thumb?36:0),priorString:number|null=null;
  const repeated=new Map<string,PositionFingering>();
  for(const note of notes){
   const options:PositionFingering[]=[];
   for(const string of strings){
    if(note.stringMidi!==undefined&&note.stringMidi!==string.midi)continue;
    const offset=note.pitch-string.midi;
    if(offset<0)continue;
    const finger=fingerAtPosition(instrument,pos.first,offset,Boolean(pos.thumb));
    if(finger!==null)options.push({pitch:note.pitch,openMidi:string.midi,offset,finger});
   }
   options.sort((a,b)=>{
    const quality=(item:PositionFingering)=>
      (item.finger==='0'?-12:0) + fingerCost(item.finger) +
      (priorString!==null&&item.openMidi!==priorString?2:0) +
      (item.offset===pos.first?0:Math.abs(item.offset-pos.first)*.35) -
      item.openMidi*.018;
    return quality(a)-quality(b);
   });
   const repeatKey=note.pitch+':'+(note.stringMidi??'auto');
   const previous=isBass?repeated.get(repeatKey):undefined;
   const chosen=previous??options[0];
   if(isBass&&chosen)repeated.set(repeatKey,chosen);
   const weight=Math.max(1,Math.min(4,Number.isFinite(note.duration)?note.duration!:1));
   if(!chosen){score-=8*weight;continue;}
   covered++;
   score+=50+weight*7+(chosen.finger==='0'?(isBass?10:3):-chosen.offset*(isBass?.65:2.5))-fingerCost(chosen.finger);
   if(priorString!==null&&priorString!==chosen.openMidi)score-=2;
   priorString=chosen.openMidi;
   if(!assignments.some(item=>item.pitch===chosen.pitch&&item.openMidi===chosen.openMidi))assignments.push(chosen);
  }
  if(!covered)continue;
  const firstStop=Math.max(0,pos.first-1);
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

/** Plan a stable sequence of hand positions. Keep a position while it covers
 * the next notes; when a shift is needed, prefer a window covering the phrase.
 * Open strings do not require a hand shift. */
export function planPracticePositions(instrument:PositionInstrument,notes:readonly PositionNote[]):(StringPositionGuide|null)[]{
 if(instrument==='Violin')return planViolinPractice(notes);
 let prior:StringPositionGuide|null=null;
 return notes.map((note,index)=>{
  const upcoming=notes.slice(index,index+5);
  const fits=(guide:StringPositionGuide,n:PositionNote)=>fingerboardStrings(instrument).some(s=>
   (n.stringMidi===undefined||n.stringMidi===s.midi)&&fingerAtPosition(instrument,guide.firstFingerOffset,n.pitch-s.midi,guide.thumb)!==null);
  const covered=(guide:StringPositionGuide)=>upcoming.filter(n=>fits(guide,n)).length;
  const candidate=suggestStringMeasurePosition(instrument,upcoming);
  let chosen=prior&&fits(prior,note)?prior:null;
  if(!chosen)chosen=candidate&&fits(candidate,note)?candidate:suggestStringMeasurePosition(instrument,[note]);
  if(chosen&&candidate&&prior&&fits(prior,note)&&fits(candidate,note)&&covered(candidate)>covered(prior)+1){
   const previous=notes[index-1];
   const gap=previous&&note.start!==undefined&&previous.start!==undefined?note.start-previous.start-(previous.duration??0):0;
   if(gap>=.125)chosen=candidate;
  }
  if(!chosen)return null;
  const fingerings:PositionFingering[]=[];
  for(const n of upcoming){
   const options=fingerboardStrings(instrument).flatMap(s=>{
    if(n.stringMidi!==undefined&&n.stringMidi!==s.midi)return [];
    const offset=n.pitch-s.midi,finger=fingerAtPosition(instrument,chosen!.firstFingerOffset,offset,chosen!.thumb);
    return finger===null?[]:[{pitch:n.pitch,openMidi:s.midi,offset,finger}];
   });
   options.sort((a,b)=>(a.finger==='0'?-100:a.offset)-(b.finger==='0'?-100:b.offset));
   const f=options[0];if(f&&!fingerings.some(x=>x.pitch===f.pitch&&x.openMidi===f.openMidi))fingerings.push(f);
  }
  prior={...chosen,fingerings};return prior;
 });
}
export function practiceShiftDurationMs(previous:PositionNote|undefined,next:PositionNote|undefined,bpm:number):number{
 if(!previous||!next||previous.start===undefined||next.start===undefined||!(bpm>0))return 120;
 const gap=Math.max(0,next.start-previous.start-(previous.duration??0));
 return Math.max(75,Math.min(450,gap*60000/bpm||90));
}

/** Global minimum-cost route across string and position alternatives. Ordinary
 * string hints are preferences, not commands to make an extreme shift.
 * Captured/explicit slides can require a particular string. */
function planViolinPractice(notes:readonly PositionNote[]):(StringPositionGuide|null)[]{
 type State={ordinal:number;f:PositionFingering;cost:number;prev:number};
 const strings=fingerboardStrings('Violin');
 const layers:State[][]=[];
 for(let i=0;i<notes.length;i++){
  const n=notes[i],previous=notes[i-1],prior=layers[i-1]??[];
  const gap=previous&&n.start!==undefined&&previous.start!==undefined?Math.max(0,n.start-previous.start-(previous.duration??0)):0;
  const states:State[]=[];
  for(let ordinal=0;ordinal<violin.length;ordinal++){
   const p=violin[ordinal];
   for(const string of strings){
    if(n.lockString&&n.stringMidi!==undefined&&n.stringMidi!==string.midi)continue;
    const offset=n.pitch-string.midi,finger=fingerAtPosition('Violin',p.first,offset);
    if(finger===null)continue;
    const f={pitch:n.pitch,openMidi:string.midi,offset,finger};
    const local=ordinal*.85+Math.max(0,ordinal-2)*3+(finger==='0'?0:offset*.15)+(n.stringMidi!==undefined&&n.stringMidi!==string.midi?2:0);
    let cost=local,prev=-1;
    if(prior.length){
     cost=Infinity;
     for(let k=0;k<prior.length;k++){
      const old=prior[k],distance=Math.abs(p.first-violin[old.ordinal].first);
      const shift=distance?(12+distance*4)/(1+Math.min(2,gap)*1.5):0;
      const crossing=Math.abs(strings.findIndex(s=>s.midi===old.f.openMidi)-strings.findIndex(s=>s.midi===string.midi))*.9;
      const total=old.cost+local+shift+crossing;
      if(total<cost){cost=total;prev=k;}
     }
    }
    states.push({ordinal,f,cost,prev});
   }
  }
  layers.push(states);
 }
 const route:(State|null)[]=Array(notes.length).fill(null);
 for(let i=layers.length-1;i>=0;){
  const layer=layers[i];if(!layer.length){i--;continue;}
  let k=layer.reduce((best,s,index)=>s.cost<layer[best].cost?index:best,0);
  while(i>=0&&k>=0&&layers[i][k]){const state:State=layers[i][k];route[i]=state;k=state.prev;i--;}
 }
 return route.map((state,index)=>{
  if(!state)return null;
  const p=violin[state.ordinal],firstStop=Math.max(1,p.first-1);
  const fingerings=[state.f];
  for(const next of route.slice(index+1,index+5)){
   if(!next||next.ordinal!==state.ordinal)break;
   if(!fingerings.some(f=>f.pitch===next.f.pitch))fingerings.push(next.f);
  }
  return {instrument:'Violin',position:p.label,ordinal:state.ordinal,firstFingerOffset:p.first,firstStop,lastStop:firstStop+7,thumb:false,fingerings,anchorStringMidi:state.f.openMidi,anchorMidi:state.f.openMidi+p.first};
 });
}
