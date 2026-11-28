import {physicalBandoneonLayoutForPart} from './bandoneon';
import {customBandoneonLayoutForPart} from './bandoneonLayoutFormat';
import {planSustainedBellows,type BellowsDirection,type BandoneonButton} from './bandoneonLayout';
import type {Project,Instrument} from './music';
import {noteSoundingDuration,stringGlissandoPlayback,type Note} from './music';
/** Convert a selected song measure into a transport-relative playback window. */
export type PlaybackOrigin='beginning'|'selected';
export interface ArrangementPlaybackWindow {
  startMeasure:number;
  startBeat:number;
  transportStartBeat:number;
  countInBeats:number;
  durationSeconds:number;
  secondsPerBeat:number;
}
export function arrangementPlaybackWindow(totalMeasures:number,beatsPerMeasure:number,bpm:number,startMeasure:number,pickupBeats=0,withCountIn=false):ArrangementPlaybackWindow {
  if(!Number.isInteger(totalMeasures)||totalMeasures<1)throw Error('Arrangement must contain at least one measure');
  if(!Number.isFinite(beatsPerMeasure)||beatsPerMeasure<=0)throw Error('Invalid meter');
  if(!Number.isFinite(bpm)||bpm<=0)throw Error('Invalid tempo');
  const clamped=Math.max(0,Math.min(totalMeasures-1,Math.trunc(Number.isFinite(startMeasure)?startMeasure:0)));
  const secondsPerBeat=60/bpm;
  const startBeat=clamped===0&&pickupBeats>0?beatsPerMeasure-pickupBeats:clamped*beatsPerMeasure;
  const countInBeats=withCountIn?beatsPerMeasure:0;
  return {startMeasure:clamped,startBeat,countInBeats,transportStartBeat:startBeat-countInBeats,durationSeconds:(totalMeasures*beatsPerMeasure-startBeat)*secondsPerBeat,secondsPerBeat};
}
/** Keep the full preparatory bar, then continue clicking through rests in a written pickup. */
export function arrangementCountInEnd(window:ArrangementPlaybackWindow,beatsPerMeasure:number,firstAttack:number):number {
  if(!window.countInBeats)return 0;
  const startsAtPickup=window.startMeasure===0&&window.startBeat>0;
  if(startsAtPickup&&firstAttack>=window.startBeat&&firstAttack<beatsPerMeasure)
    return firstAttack-window.transportStartBeat;
  return window.countInBeats;
}
/** Earlier note attacks are skipped; all scheduled events are relative to the new start. */
export function arrangementEventTime(absoluteBeat:number,window:ArrangementPlaybackWindow):number|null {
  if(!Number.isFinite(absoluteBeat)||absoluteBeat<window.startBeat-1e-7)return null;
  return Math.max(0,(absoluteBeat-window.startBeat)*window.secondsPerBeat);
}

/** Merge only explicitly tied, contiguous notes of the same pitch/staff/voice.
 * Notation remains untouched; the final segment's gate controls release. */
export function tiedPlaybackNotes(notes:readonly Note[]):Note[]{
 const result:Note[]=[],last=new Map<string,Note>();
 for(const note of [...notes].sort((a,b)=>a.start-b.start||a.pitch-b.pitch)){
  const key=[note.pitch,note.xmlStaff??1,note.xmlVoice??''].join(':');
  const previous=last.get(key);
  if(note.xmlTieContinuation&&previous&&Math.abs(previous.start+previous.duration-note.start)<1e-5){
   const audible=note.start-previous.start+noteSoundingDuration(note);
   previous.duration=note.start+note.duration-previous.start;
   previous.gate=audible/previous.duration;
  }else{
   const copy={...note};result.push(copy);last.set(key,copy);
  }
 }
 return result;
}
/** A selected playback range can begin inside a sustained note. */
export function pianoGlissandoPitches(start:number,target:number,keys:'white'|'black'|'chromatic'):number[]{
 if(!Number.isInteger(start)||!Number.isInteger(target)||start<21||start>108||target<21||target>108||start===target)return [];
 const direction=Math.sign(target-start),white=[0,2,4,5,7,9,11],result=[start];
 for(let pitch=start+direction;pitch!==target;pitch+=direction)if(keys==='chromatic'||(keys==='white')===white.includes(pitch%12))result.push(pitch);
 return [...result,target];
}
export function pianoPlaybackNotes(notes:readonly Note[],transpose=0,emulatePedal=true):Note[]{
 const attacks:Note[]=[];
 const pedals=emulatePedal?notes.filter(n=>n.pianoPedalBeats&&n.pianoPedalBeats>0).map(n=>({start:n.start+(n.pianoPedalOffset??0),end:n.start+(n.pianoPedalOffset??0)+n.pianoPedalBeats!})).sort((a,b)=>a.start-b.start):[];
 for(const n of notes){
  const g=n.pianoGlissando;
  const pitches=g?pianoGlissandoPitches(n.pitch+transpose,n.pitch+g.interval+transpose,g.keys).map(p=>p-transpose):[];
  if(!g||pitches.length<2){attacks.push({...n});continue;}
  const step=g.beats/(pitches.length-1);
  for(let i=0;i<pitches.length;i++){
   const pitch=pitches[i],start=n.start+i*step;
   if(i>0&&notes.some(other=>other!==n&&other.pitch===pitch&&Math.abs(other.start-start)<1e-5))continue;
   attacks.push({...n,pianoGlissando:undefined,pianoPedalBeats:undefined,pitch,start,duration:i===pitches.length-1?Math.min(.25,step):step,gate:.85,xmlTieContinuation:undefined});
  }
 }
 const sorted=attacks.sort((a,b)=>a.start-b.start||a.pitch-b.pitch);
 for(const n of sorted){
  const release=n.start+noteSoundingDuration(n);
  const active=pedals.filter(p=>p.start<=release+1e-7&&p.end>release+1e-7).at(-1);
  if(!active)continue;
  const nextAttack=sorted.find(other=>other.pitch===n.pitch&&other.start>n.start+1e-7);
  const nextChange=pedals.find(p=>p.start>active.start+1e-7&&p.start<active.end);
  const end=Math.min(active.end,nextChange?.start??Infinity,nextAttack?.start??Infinity);
  if(end>release){n.duration=Math.max(n.duration,end-n.start);n.gate=(end-n.start)/n.duration;}
 }
 return sorted;
}
/** Hardware sustain is independent of note attacks, including when starting in a held pedal. */
export function pianoPedalWindows(notes:readonly Note[],start:number,end:number):{start:number;end:number}[]{
 const spans=notes.flatMap(note=>{
  const from=note.start+(note.pianoPedalOffset??0),to=from+(note.pianoPedalBeats??0);
  const left=Math.max(start,from),right=Math.min(end,to);
  return Number.isFinite(left)&&Number.isFinite(right)&&right>left&&note.pianoPedalBeats?[{start:left,end:right}]:[];
 }).sort((a,b)=>a.start-b.start||a.end-b.end);
 const merged:typeof spans=[];
 for(const span of spans){
  const last=merged.at(-1);
  if(last&&span.start<last.end-1e-7)last.end=Math.max(last.end,span.end);else merged.push(span);
 }
 return merged;
}
export function playbackNotesInRange(notes:readonly Note[],start:number,end=Infinity,transpose=0,nativePedal=false):Note[]{
 const tied=tiedPlaybackNotes(notes);
 const sounding=tied.some(n=>n.pianoGlissando||n.pianoPedalBeats)?pianoPlaybackNotes(tied,transpose,!nativePedal):tied;
 return sounding.flatMap(n=>{
  if(n.stringGlissando){if(n.start>=end-1e-7||n.start+n.stringGlissando.beats<=start+1e-7)return [];return [stringGlissandoPlayback(n,start,end)];}
  const audibleEnd=n.start+noteSoundingDuration(n);
  if(audibleEnd<=start+1e-7||n.start>=end-1e-7)return [];
  if(n.start>=start&&n.start+n.duration<=end)return [n];
  const onset=Math.max(start,n.start),duration=Math.min(end,n.start+n.duration)-onset;
  if(duration<=1e-7)return [];
  return [{...n,start:onset,duration,gate:Math.min(1,(Math.min(end,audibleEnd)-onset)/duration)}].filter(n=>n.gate>0);
 });
}

/** Only user-supplied physical layouts are authoritative until factory chart
 * transcriptions are verified. Preserve normal playback on unknown layouts. */
export function bandoneonPlaybackPlan(project:Project,inst:Instrument,notes:readonly Note[]){
 const assignments=new Map<Note,{direction:BellowsDirection;button:BandoneonButton}>();
 if(!inst.startsWith('Bandoneon')||!customBandoneonLayoutForPart(project,inst))return {assignments,decisions:[]};
 const layout=physicalBandoneonLayoutForPart(project,inst);if(!layout)return {assignments,decisions:[]};
 const shift=project.transposeSemitones??0;
 const targets=notes.flatMap((n,i)=>{
  const staff=n.staffOverride??n.xmlStaff,hand=staff===1?'right' as const:staff===2?'left' as const:undefined;
  const start=n.start,end=start+noteSoundingDuration(n);
  return [{id:String(i),pitch:n.pitch+shift,hand,start,end,direction:n.bellowsDirection,buttonId:n.bandoneonButtonId},...(n.gesture?.partner?.length?[{id:i+':partner',pitch:n.gesture.partner[0].pitch+shift,hand,start,end}]:[])];
 });
 const decisions=planSustainedBellows(layout,targets);
 for(const d of decisions)if(d.direction)d.targetIds.forEach((id,i)=>{
  if(id.includes(':'))return;
  const n=notes[Number(id)];if(n&&!assignments.has(n))assignments.set(n,{direction:d.direction!,button:d.buttons[i]});
 });
 return {assignments,decisions};
}
