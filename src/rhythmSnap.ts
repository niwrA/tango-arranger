/** Rhythm onset provenance used by the Note Editor and portable .tango projects.
 * The stored label identifies an explicit action, not an inferred resemblance.
 * This module is pure except for reading the existing rhythm-preset catalog. */
import {rhythmSlots,quantizeRhythmPreset,type RhythmPreset,type RhythmSlot} from './rhythmEditor';
import type {Note,Instrument} from './music';

export type RhythmAttachment={
  kind:'preset'|'edited-grid';
  preset?:RhythmPreset;
  /** Local beat within the note's onset measure; quarter-note units, zero-based. */
  targetBeat:number;
  originalBeat:number;
  /** Captures written duration at the time the rhythm was applied. */
  targetDuration:number;
  accent:boolean;
};

const epsilon=1e-6;
const rounded=(n:number)=>Number(n.toFixed(6));
const validNumber=(n:number)=>Number.isFinite(n)&&n>=0;
/** The Note Editor works in sixteenth-note increments, including 2/4 and 3/4. */
export function presetRhythmSlots(preset:RhythmPreset,beats:number,inst:Instrument,profile:string):RhythmSlot[]{
  return quantizeRhythmPreset(rhythmSlots(preset,beats,inst,profile),beats,0.25);
}
export function nearestRhythmSlot(localBeat:number,preset:RhythmPreset,beats:number,inst:Instrument,profile:string,maxDistance=0.5):RhythmSlot|undefined{
  if(!Number.isFinite(localBeat)||localBeat<0||localBeat>=beats||!Number.isFinite(maxDistance)||maxDistance<0)return undefined;
  const slots=presetRhythmSlots(preset,beats,inst,profile);
  const candidates=slots.filter(slot=>Math.abs(slot.beat-localBeat)<=maxDistance+epsilon);
  return candidates.sort((a,b)=>Math.abs(a.beat-localBeat)-Math.abs(b.beat-localBeat)||a.beat-b.beat)[0];
}
/** Attach only when a note was actually snapped; duration and pitch stay intact.
 * A note whose written duration crosses the end of the song is rejected upstream.
 */
export function snapNoteToPreset(note:Note,beats:number,inst:Instrument,profile:string,preset:RhythmPreset,maxDistance=0.5):Note{
  const measure=Math.floor((note.start+epsilon)/beats);
  const local=rounded(note.start-measure*beats);
  const slot=nearestRhythmSlot(local,preset,beats,inst,profile,maxDistance);
  if(!slot)return note;
  const start=rounded(measure*beats+slot.beat);
  return {...note,start,rhythmSource:{kind:'preset',preset,targetBeat:slot.beat,originalBeat:local,
    targetDuration:note.duration,accent:slot.accent}};
}
/** Rhythm Editor retiming uses the exact applied attack, including edited grids.
 * Unlike preset snapping it also applies the slot's written duration. */
export function markRetimedNote(note:Note,beats:number,previousStart:number,slot:RhythmSlot,preset?:RhythmPreset):Note{
  const measure=Math.floor((note.start+epsilon)/beats);
  const beat=rounded(note.start-measure*beats);
  return {...note,rhythmSource:{
    kind:preset?'preset':'edited-grid',
    ...(preset?{preset}:{}),
    targetBeat:beat,originalBeat:rounded(previousStart-measure*beats),
    targetDuration:note.duration,accent:slot.accent
  }};
}
/** Older projects have no source data. Do not infer provenance from a match. */
export function rhythmAttachmentValid(note:Note,beats:number):boolean{
  const s=note.rhythmSource;if(!s)return false;
  if(!validNumber(s.targetBeat)||!validNumber(s.originalBeat)||s.targetBeat>=beats||
     !Number.isFinite(s.targetDuration)||s.targetDuration<=0)return false;
  const local=rounded(note.start-Math.floor((note.start+epsilon)/beats)*beats);
  return Math.abs(local-s.targetBeat)<epsilon&&Math.abs(note.duration-s.targetDuration)<epsilon;
}
export function clearRhythmSourceIfRetimed(previous:Note,updated:Note,beats:number):Note{
  if(!previous.rhythmSource)return updated;
  if(Math.abs(previous.start-updated.start)>epsilon||Math.abs(previous.duration-updated.duration)>epsilon||!rhythmAttachmentValid(updated,beats)){
    const next={...updated};delete next.rhythmSource;return next;
  }
  return updated;
}
export function rhythmAttachmentLabel(attachment:RhythmAttachment):string{
  if(attachment.kind==='edited-grid')return 'Edited rhythm pattern';
  const names:Record<RhythmPreset,string>={
    marcato_four:'Marcato en cuatro',marcato_two:'Marcato en dos',syncopa:'Síncopa',
    tres_tres_dos:'3–3–2',habanera:'Habanera',offbeat:'Offbeat chords',
    style:'Current orchestra style',profile_darienzo:'D’Arienzo',profile_disarli:'Di Sarli',
    profile_troilo:'Troilo',profile_pugliese:'Pugliese',profile_fresedo:'Fresedo',
    profile_canaro:'Canaro',profile_traditional:'Traditional'
  };
  return names[attachment.preset??'style'];
}
