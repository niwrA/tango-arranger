import {validateRhythmPattern,type RhythmSlot} from './rhythmEditor';

/** Device-local reusable patterns. These belong to the user's library, not a song.
 * JSON exported for the song does not implicitly include this browser library. */
export interface CustomRhythm {id:string;name:string;beats:number;slots:RhythmSlot[]}
export const CUSTOM_RHYTHM_STORAGE_KEY='tango-arranger-custom-rhythms-v1';
export type RhythmStorage=Pick<Storage,'getItem'|'setItem'>;
const maxPatterns=64;
function storageOrDefault(storage?:RhythmStorage):RhythmStorage{
 if(storage)return storage;
 if(typeof localStorage==='undefined')throw Error('Local rhythm storage is not available in this browser.');
 return localStorage;
}
function validated(raw:unknown):CustomRhythm|null{
 if(!raw||typeof raw!=='object')return null;
 const record=raw as Partial<CustomRhythm>;
 const beats=record.beats;
 // Narrow the value once, before the remaining record checks: a saved
 // library entry may have no meter at all.
 if(typeof beats!=='number')return null;
 if(typeof record.id!=='string'||!record.id.startsWith('custom-rhythm-')||
    typeof record.name!=='string'||!record.name.trim()||record.name.length>64||
    !Number.isInteger(beats)||beats<2||beats>4||
    !Array.isArray(record.slots)||!record.slots.length||record.slots.length>64)return null;
 try{
  const slots=validateRhythmPattern(record.slots as RhythmSlot[],beats);
  if(slots.some(s=>typeof s.accent!=='boolean'))return null;
  return {id:record.id,name:record.name.trim(),beats,slots};
 }catch{return null;}
}
export function listCustomRhythms(storage?:RhythmStorage):CustomRhythm[]{
 try{
  const raw=JSON.parse(storageOrDefault(storage).getItem(CUSTOM_RHYTHM_STORAGE_KEY)||'[]');
  if(!Array.isArray(raw))return [];
  const seen=new Set<string>();
  const output:CustomRhythm[]=[];
  for(const item of raw.slice(0,maxPatterns)){
   const checked=validated(item);
   if(!checked||seen.has(checked.id))continue;
   output.push(checked);seen.add(checked.id);
  }
  return output;
 }catch{return [];}
}
export function saveCustomRhythm(name:string,beats:number,slots:RhythmSlot[],storage?:RhythmStorage):CustomRhythm[]{
 const clean=name.trim();
 if(!clean||clean.length>64)throw Error('Give the rhythm a name of 1–64 characters.');
 if(!Number.isInteger(beats)||beats<2||beats>4)throw Error('Supported meters are 2/4, 3/4 and 4/4.');
 const validatedSlots=validateRhythmPattern(slots,beats);
 if(!validatedSlots.length)throw Error('Add at least one rhythm attack before saving.');
 if(validatedSlots.length>64)throw Error('Too many rhythm attacks to save.');
 const store=storageOrDefault(storage),saved=listCustomRhythms(store);
 const existing=saved.find(r=>r.name.toLocaleLowerCase()===clean.toLocaleLowerCase()&&r.beats===beats);
 if(!existing&&saved.length>=maxPatterns)throw Error('You have reached the limit of 64 custom rhythms.');
 const id=existing?.id??'custom-rhythm-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);
 const next=saved.filter(r=>r.id!==id);
 next.push({id,name:clean,beats,slots:validatedSlots});
 store.setItem(CUSTOM_RHYTHM_STORAGE_KEY,JSON.stringify(next));
 return next;
}
export function deleteCustomRhythm(id:string,storage?:RhythmStorage):CustomRhythm[]{
 const store=storageOrDefault(storage);
 const saved=listCustomRhythms(store);
 if(!saved.some(r=>r.id===id))throw Error('Saved rhythm not found.');
 const next=saved.filter(r=>r.id!==id);
 store.setItem(CUSTOM_RHYTHM_STORAGE_KEY,JSON.stringify(next));
 return next;
}
