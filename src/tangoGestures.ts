/** Editable tango expression gestures. Times are normalized over the note's
 * sounding duration, so resizing a note never changes its stored contour. */
import type {Note} from './music';
export type GestureContour='up'|'down'|'rise_fall'|'fall_rise';
export type GesturePoint={at:number;pitch:number};
export type TangoGesture={kind:'sirena'|'latigo'|'portamento';contour:GestureContour;points:GesturePoint[];partner?:GesturePoint[];tremolo?:boolean};
export type GesturePreset='portamento_up'|'portamento_down'|'latigo_up'|'latigo_down'|
 'sirena_single_up'|'sirena_single_down'|'sirena_single_rise_fall'|'sirena_single_fall_rise'|
 'sirena_double_up'|'sirena_double_down'|'sirena_double_rise_fall'|'sirena_double_fall_rise'|
 'sirena_double_down_tremolo';
export const GESTURE_PRESETS:readonly {value:GesturePreset;label:string}[]=[
 {value:'portamento_up',label:'Portamento ↑'},{value:'portamento_down',label:'Portamento ↓'},
 {value:'latigo_up',label:'Látigo ↑'},{value:'latigo_down',label:'Látigo ↓'},
 {value:'sirena_single_up',label:'Sirena · single ↑'},{value:'sirena_single_down',label:'Sirena · single ↓'},
 {value:'sirena_single_rise_fall',label:'Sirena · single ↑↓'},{value:'sirena_single_fall_rise',label:'Sirena · single ↓↑'},
 {value:'sirena_double_up',label:'Sirena · double ↑'},{value:'sirena_double_down',label:'Sirena · double ↓'},
 {value:'sirena_double_rise_fall',label:'Sirena · double ↑↓'},{value:'sirena_double_fall_rise',label:'Sirena · double ↓↑'},
 {value:'sirena_double_down_tremolo',label:'Sirena · double ↓ + tremolo'}
];
const violinStrings=[55,62,69,76];
/** Conservative first-position adjacent-string check. This is a warning-level
 * ergonomic approximation, not a guarantee of finger or bow feasibility. */
export function violinPairPlayable(upper:number,lower:number):boolean {
 return violinStrings.slice(0,3).some((open,index)=>{
  const a=lower-open,b=upper-violinStrings[index+1];
  return a>=0&&a<=7&&b>=0&&b<=7;
 });
}
export function validateGesture(note:Pick<Note,'pitch'|'technique'>,inst:string,gesture:TangoGesture,range:[number,number]):void{
 if(!['sirena','latigo','portamento'].includes(gesture.kind)||!['up','down','rise_fall','fall_rise'].includes(gesture.contour))throw Error('Unsupported tango gesture');
 if(inst.startsWith('Piano')||inst.startsWith('Voice')||note.technique==='pizzicato')throw Error('Slides require a pitched, sustained instrument (no pizzicato)');
 if(gesture.kind==='sirena'&&!inst.startsWith('Violin'))throw Error('Sirenas are currently supported on violin parts');
 const inspect=(points:GesturePoint[])=>{
  if(!Array.isArray(points)||points.length<2||points.length>4)throw Error('Gesture needs 2–4 pitch points');
  for(let i=0;i<points.length;i++){
   const pt=points[i];
   if(!Number.isFinite(pt.at)||!Number.isInteger(pt.pitch)||pt.pitch<range[0]||pt.pitch>range[1])
    throw Error('Gesture pitch outside instrument range');
   if(i&&pt.at<=points[i-1].at)throw Error('Gesture positions must increase');
  }
  if(Math.abs(points[0].at)>1e-7||Math.abs(points[points.length-1].at-1)>1e-7)throw Error('Gesture must span the full note');
 };
 inspect(gesture.points);
 if(gesture.points[0].pitch!==note.pitch)throw Error('Gesture starting pitch must match note pitch');
 if(gesture.partner){
  if(gesture.kind!=='sirena'||!inst.startsWith('Violin'))throw Error('Double sirenas require a violin part');
  inspect(gesture.partner);
  if(gesture.partner.length!==gesture.points.length||gesture.partner.some((pt,i)=>Math.abs(pt.at-gesture.points[i].at)>1e-7))throw Error('Double sirena voices must be synchronized');
  for(let i=0;i<gesture.points.length;i++){
   const upper=gesture.points[i].pitch,lower=gesture.partner[i].pitch;
   if(upper<=lower||!violinPairPlayable(upper,lower))throw Error('Double sirena requires reachable adjacent-string notes');
  }
  for(let i=1;i<gesture.points.length;i++){
   const prev=gesture.points[i-1],next=gesture.points[i],prevLow=gesture.partner[i-1],nextLow=gesture.partner[i];
   for(let j=1;j<8;j++){
    const t=j/8,upper=Math.round(prev.pitch+(next.pitch-prev.pitch)*t),lower=Math.round(prevLow.pitch+(nextLow.pitch-prevLow.pitch)*t);
    if(!violinPairPlayable(upper,lower))throw Error('Double sirena passes through an unreachable finger position');
   }
  }
 }
}
function shapePoints(pitch:number,contour:GestureContour,steps:number):GesturePoint[]{
 const direction=contour==='down'||contour==='fall_rise'?-1:1;
 return contour==='rise_fall'||contour==='fall_rise'
  ?[{at:0,pitch},{at:0.48,pitch:pitch+direction*steps},{at:1,pitch:pitch-direction}]
  :[{at:0,pitch},{at:1,pitch:pitch+direction*steps}];
}
/** Build a safe editable starting preset; reject unsupported double stops
 * rather than silently producing impossible simultaneous finger positions. */
export function createTangoGesture(note:Pick<Note,'pitch'|'technique'>,inst:string,preset:GesturePreset,range:[number,number]):TangoGesture{
 if(!GESTURE_PRESETS.some(g=>g.value===preset))throw Error('Unknown gesture preset');
 const kind=preset.startsWith('sirena')?'sirena':preset.startsWith('latigo')?'latigo':'portamento';
 const contour:GestureContour=preset.includes('rise_fall')?'rise_fall':preset.includes('fall_rise')?'fall_rise':preset.endsWith('_down')||preset.includes('_down_')?'down':'up';
 const double=preset.includes('_double_'),tremolo=preset.endsWith('_tremolo');
 for(let steps=kind==='latigo'?7:kind==='sirena'?4:3;steps>=1;steps--){
  const points=shapePoints(note.pitch,contour,steps);
  // Adjacent violin strings have a consistent fifth between open strings.
  const partner=double?shapePoints(note.pitch-7,contour,steps):undefined;
  const gesture:TangoGesture={kind,contour,points,...(partner?{partner}:{}),...(tremolo?{tremolo:true}:{})};
  try{validateGesture(note,inst,gesture,range);return gesture;}catch{/* Try a smaller movement, never compromise note pitch. */}
 }
 throw Error('No physically plausible contour fits this note and instrument range. Try another starting pitch.');
}
export function transposeTangoGesture(gesture:TangoGesture,semitones:number):TangoGesture{
 const move=(pts:GesturePoint[])=>pts.map(pt=>({...pt,pitch:pt.pitch+semitones}));
 return {...gesture,points:move(gesture.points),...(gesture.partner?{partner:move(gesture.partner)}:{})};
}
export function gestureLabel(gesture:TangoGesture):string{
 const direction={up:'↑',down:'↓',rise_fall:'↑↓',fall_rise:'↓↑'}[gesture.contour];
 return (gesture.kind==='sirena'?'sirena':gesture.kind==='latigo'?'látigo':'port.')+
 (gesture.partner?' ×2':'')+' '+direction+(gesture.tremolo?' trem.':'');
}
export function gestureSvgPoints(gesture:TangoGesture,voice:'primary'|'partner'='primary'):string{
 const path=voice==='partner'?gesture.partner:gesture.points;
 if(!path)return '';
 const all=[...gesture.points,...(gesture.partner??[])].map(p=>p.pitch);
 const min=Math.min(...all)-1,max=Math.max(...all)+1;
 return path.map(pt=>(pt.at*100).toFixed(2)+','+(19-(pt.pitch-min)/(max-min)*15).toFixed(2)).join(' ');
}
