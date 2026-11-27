import {brushPitchAt,type BrushStroke} from './brushGesture';
import {chordAt,chordTones,defaultInstrumentSettings,figureMeasure,generate,instrumentFamily,keyPitchClasses,sectionKey,suggestedEditorNote,writtenInstrumentRange,writtenInstrumentPitchPlayable,type Instrument,type Note,type Project,type Role} from './music';
import {rhythmSlots,type RhythmPreset} from './rhythmEditor';

export const musicalBrushes=[
 {id:'melody',label:'Melody'},
 {id:'arpeggio',label:'Arpeggio'},
 {id:'bass',label:'Bass'},
 {id:'voicings',label:'Chord voicings'},
 {id:'repetition',label:'Rhythmic repetition'},
 {id:'diatonic',label:'Diatonic approach'},
 {id:'chromatic',label:'Chromatic approach'}
] as const;
export type BrushKind=typeof musicalBrushes[number]['id'];
export type MusicalBrush={kind:BrushKind;stroke:BrushStroke;rhythm:RhythmPreset;referencePitch:number;replace?:boolean};

export function instrumentBrushes(instrument:Instrument){
 const family=instrumentFamily(instrument);
 return musicalBrushes.filter(brush=>brush.id!=='voicings'||['Piano','Bandoneon','Violin','Guitar'].includes(family));
}

function nearestPitch(pitches:readonly number[],target:number):number{
 return pitches.reduce((best,pitch)=>Math.abs(pitch-target)<Math.abs(best-target)?pitch:best,pitches[0]);
}

export function composeMusicalBrush(project:Project,instrument:Instrument,existing:readonly Note[],brush:MusicalBrush,creationRole?:Role):Note[]{
 const {kind,stroke,rhythm,referencePitch}=brush;
 const {fromBeat,toBeat,points}=stroke;
 const {beats}=project;
 const first=Math.floor(fromBeat/beats),last=Math.ceil(toBeat/beats)-1;
 const bars=Array.from({length:last-first+1},(_,i)=>first+i);
 const [low,high]=writtenInstrumentRange(instrument,project);
 const pool=Array.from({length:high-low+1},(_,i)=>low+i).filter(pitch=>writtenInstrumentPitchPlayable(instrument,pitch,project));
 if(!pool.length)return [];
 const contour=(beat:number)=>brushPitchAt(points,beat,referencePitch);
 const relevant=(start:number)=>start>=fromBeat-1e-7&&start<toBeat-1e-7;
 const localBeat=(start:number)=>start-Math.floor(start/beats)*beats;
 const partRole:Role=kind==='voicings'?'chords':kind==='bass'?'bass':creationRole??'melody';
 const roleMap={...project.measureRoles};
 for(const bar of bars)roleMap[`${instrument}:${bar}`]=partRole;
 const settings={...project.instrumentSettings,
  [instrument]:{...(project.instrumentSettings?.[instrument]??defaultInstrumentSettings()[instrument]),activity:1}};
 const context={...project,measureRoles:roleMap,instrumentSettings:settings};
 const chords=(start:number)=>chordAt(project.bars[Math.floor(start/beats)].chord,beats,localBeat(start));
 const scale=(start:number)=>keyPitchClasses(sectionKey(project,project.bars[Math.floor(start/beats)].section));
 const pitchChoices=(pcs:readonly number[])=>pool.filter(pitch=>pcs.includes(pitch%12));
 const clip=(note:Note)=>({...note,duration:Math.min(note.duration,toBeat-note.start)});
 const make=(start:number,pitch:number,length?:number)=>suggestedEditorNote(context,instrument,Math.floor(start/beats),localBeat(start),pitch,Math.min(length??Infinity,toBeat-start));

 if(kind==='bass'||kind==='voicings'||kind==='arpeggio'){
  const descending=contour(toBeat)<contour(fromBeat);
  const piano=instrument.startsWith('Piano'),split=project.pianoSplitPitch??60;
  const notes=kind==='arpeggio'?bars.flatMap(bar=>figureMeasure(context,instrument,bar,descending?'notes_down':'notes_up',0,existing)):generate(context)[instrument]??[];
  const result=notes.filter(note=>relevant(note.start)&&(kind==='bass'||!piano||note.pitch>=split)&&
   (kind==='arpeggio'?pitchChoices([note.pitch%12]).some(pitch=>!piano||pitch>=split):pool.includes(note.pitch))).map(clip);
  if(kind==='arpeggio'){
   let previous:number|undefined;
   for(const note of result){
    const pitches=pitchChoices([note.pitch%12]).filter(pitch=>!piano||pitch>=split);
    const directed=pitches.filter(pitch=>previous===undefined||(descending?pitch<previous:pitch>previous));
    note.pitch=nearestPitch(directed.length?directed:pitches,contour(note.start));
    previous=note.pitch;
   }
  }
  if(result.length||kind==='voicings'||!chords(fromBeat))return result;
  const choices=pitchChoices(chordTones(chords(fromBeat)).slice(0,kind==='bass'?1:undefined));
  return choices.length?[make(fromBeat,nearestPitch(choices,kind==='bass'?Math.min(55,contour(fromBeat)):contour(fromBeat)))]:[];
 }

 const template=beats>=2&&beats<=4?rhythmSlots(rhythm,beats,instrument,project.profile):
  Array.from({length:beats},(_,beat)=>({beat,duration:1,accent:beat===0}));
 const starts=bars.flatMap(bar=>template.map(slot=>({...slot,start:bar*beats+slot.beat})))
  .filter(slot=>relevant(slot.start));
 if(starts[0]?.start>fromBeat+1e-7||!starts.length)starts.unshift({start:fromBeat,beat:localBeat(fromBeat),duration:Math.min(0.5,(starts[0]?.start??toBeat)-fromBeat),accent:false});
 const next=existing.filter(note=>note.start>=toBeat-1e-7).sort((a,b)=>a.start-b.start)[0];
 const resolutionChoices=pitchChoices(chords(toBeat-1e-7)?chordTones(chords(toBeat-1e-7)):scale(toBeat-1e-7));
 const resolution=next&&next.start-toBeat<=beats?next.pitch:nearestPitch(resolutionChoices,contour(toBeat));
 const direction=contour(fromBeat)<=resolution?-1:1;
 const repeated=nearestPitch(pitchChoices(scale(fromBeat)),contour(fromBeat));
 return starts.map(({start,duration,accent},index)=>{
  let pitch=repeated;
  if(kind==='melody')pitch=nearestPitch(pitchChoices(accent&&chords(start)?chordTones(chords(start)):scale(start)),contour(start));
  if(kind==='chromatic')pitch=nearestPitch(pool,resolution+direction*Math.min(4,starts.length-index));
  if(kind==='diatonic'){
   const side=pitchChoices(scale(start)).filter(value=>direction<0?value<resolution:value>resolution).sort((a,b)=>direction*(a-b));
   pitch=side[Math.min(side.length-1,3,starts.length-index-1)]??nearestPitch(pitchChoices(scale(start)),resolution);
  }
  const note=make(start,pitch,Math.min(duration,(starts[index+1]?.start??toBeat)-start));
  if(accent){note.accent=true;note.articulation='marcato_staccato';}
  if(kind==='repetition')note.rhythmSource={kind:'preset',preset:rhythm,originalBeat:localBeat(start),targetBeat:localBeat(start),targetDuration:note.duration,accent};
  return note;
 });
}
