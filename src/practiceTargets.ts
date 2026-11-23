import {partStaffForNote,type Instrument,type Note} from './music';

export type PracticeStaff='all'|'upper'|'lower';
export type ChordTarget='highest'|'lowest';

/** Keep whole attacks for display, but let the tuner assess one pitch per attack. */
export function practiceTargets(notes:readonly Note[],instrument:Instrument,split:number,staff:PracticeStaff,chordTarget:ChordTarget){
 const ordered=notes.filter(note=>!note.xmlTieContinuation&&Number.isInteger(note.pitch)&&note.pitch>=0&&note.pitch<=127)
  .sort((a,b)=>a.start-b.start||a.pitch-b.pitch);
 const targets:Note[]=[];
 const chords=new Map<Note,number[]>();
 const pitches=new Map<Note,number>();
 for(let i=0;i<ordered.length;){
  const attack=[ordered[i++]];
  while(i<ordered.length&&ordered[i].start-attack[0].start<1e-6)attack.push(ordered[i++]);
  const tones=attack.flatMap(note=>{
   const partner=note.gesture?.partner?.[0]?.pitch;
   return partner===undefined?[{note,pitch:note.pitch}]:[{note,pitch:note.pitch},{note,pitch:partner}];
  }).sort((a,b)=>a.pitch-b.pitch);
  const candidates=staff==='all'?tones:tones.filter(({note})=>partStaffForNote(note,instrument,split)===(staff==='upper'?1:2));
  const target=chordTarget==='highest'?candidates.at(-1):candidates[0];
  if(target){
   targets.push(target.note);
   pitches.set(target.note,target.pitch);
   chords.set(target.note,[...new Set(tones.map(tone=>tone.pitch))]);
  }
 }
 return {targets,chords,pitches};
}
