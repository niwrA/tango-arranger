import type {InstrumentFamily} from './music';

type InstrumentDrawing={outline:string;solid?:string};
/** Original 32-unit drawings; kept as vectors so small map labels stay sharp. */
export const INSTRUMENT_BADGE_ICONS:Record<InstrumentFamily,InstrumentDrawing>={
 Piano:{outline:'M4 6h24v21H4z M10 17v10 M16 17v10 M22 17v10',solid:'M8 6h4v11H8z M14 6h4v11h-4z M20 6h4v11h-4z'},
 Contrabass:{outline:'M15 2h3v4h-3z M16.5 6v17 M14.5 10c-3 .3-4.4 2.1-3.5 4.2l1 2.2c-2.4 1.4-3.4 3.7-2.8 6.1.6 2.5 2.5 4.5 5.3 4.5h4c2.8 0 4.7-2 5.3-4.5.6-2.4-.4-4.7-2.8-6.1l1-2.2c.9-2.1-.5-3.9-3.5-4.2 M13 22h7 M16.5 27v4 M12.5 18.5c1 .7 1 2.4 0 3.2 M20.5 18.5c-1 .7-1 2.4 0 3.2'},
 Violin:{outline:'M20 5l2-2 3 3-2 2z M19 7l4 4-8 8-4-4z M12 13c-2-2-5-.7-5 1.7 0 1.2-.5 1.8-1.5 2.2-3.7 1.5-4.4 5.2-1.6 8 2.8 2.8 6.6 2 8.1-1.7.4-1 1-1.5 2.2-1.5 2.4 0 3.7-3 1.7-5 M7.5 23L22 8 M29 12L17 29 M27 11L15 28'},
 Bandoneon:{outline:'M3 8h6v16H3z M23 8h6v16h-6z M9 10h14v12H9 M12 10v12 M16 10v12 M20 10v12 M5.5 12h.01 M5.5 16h.01 M5.5 20h.01 M26.5 12h.01 M26.5 16h.01 M26.5 20h.01'},
 Voice:{outline:'M11 8a5 5 0 0 1 10 0v8a5 5 0 0 1-10 0z M7 14v2a9 9 0 0 0 18 0v-2 M16 25v5 M11 30h10 M12 9h8 M12 13h8'},
 Guitar:{outline:'M14.5 2h4v5h-4z M15 7v10 M18 7v10 M14 13c-4-2-7 1-5 5l.5 1c-4 2-4.8 7-1.5 10 3.1 2.5 9.9 2.5 13 0 3.3-3 2.5-8-1.5-10l.5-1c2-4-1-7-5-5 M13 22a3 3 0 1 0 6 0 3 3 0 0 0-6 0 M12 28h8'},
 Clarinet:{outline:'M13 3l2-2 3 2-1 5h-3z M14 8l-1 16-4 6h14l-4-6-2-16 M13 24h6 M13.7 12h4.6 M13.5 17h5 M13.2 22h5.6'},
 Flute:{outline:'M4 25L25 4l3 3L7 28z M23 6l3 3 M8.5 23.5h.01 M12.5 19.5h.01 M16.5 15.5h.01 M20.5 11.5h.01'},
 Trumpet:{outline:'M2 13h5 M7 11v4 M7 13h12l10-6v18l-10-6H10a4 4 0 0 1 0-8h9 M12 11V7 M10 7h4 M17 11V7 M15 7h4 M19 13v6'},
 Trombone:{outline:'M2 9h15l12-5v14l-12-5H9 M17 9v4 M5 9v15a4 4 0 0 0 4 4h11a3 3 0 0 0 0-6H9v-9 M2 7v4'}
};
const UNKNOWN_INSTRUMENT:InstrumentDrawing={outline:'M12 24V7l14-3v17 M12 11l14-3 M12 24a4 3 0 1 1-8 0 4 3 0 0 1 8 0 M26 21a4 3 0 1 1-8 0 4 3 0 0 1 8 0'};
const families=Object.keys(INSTRUMENT_BADGE_ICONS) as InstrumentFamily[];

function badgeFamily(instrument:string){
 return families.find(family=>instrument===family||instrument.startsWith(family+' '))??null;
}
function preferredNumber(instrument:string,family:InstrumentFamily){
 const suffix=instrument.slice(family.length).trim();
 if(!suffix)return 1;
 if(!/^[IVX]+$/.test(suffix))return null;
 const values:Record<string,number>={I:1,V:5,X:10};
 let number=0;
 for(let i=0;i<suffix.length;i++)number+=(values[suffix[i]]<(values[suffix[i+1]]??0)?-1:1)*values[suffix[i]];
 return number>0?number:null;
}

/** Use internal part identities, never display names or the filtered map rows. */
export function instrumentBadgeIdentity(instrument:string,roster:readonly string[]){
 const family=badgeFamily(instrument);
 if(!family)return {family:null,number:null,icon:UNKNOWN_INSTRUMENT};
 const peers=[...new Set([...roster.filter(part=>badgeFamily(part)===family),instrument])].sort();
 // Explicit numerals remain visible even if the other family members are removed.
 if(peers.length===1&&instrument===family)return {family,number:null,icon:INSTRUMENT_BADGE_ICONS[family]};
 const assigned=new Map<string,number>(),used=new Set<number>(),unassigned:string[]=[];
 for(const part of peers){
  const number=preferredNumber(part,family);
  if(number!==null&&!used.has(number)){assigned.set(part,number);used.add(number);}
  else unassigned.push(part);
 }
 // Imported rosters can contain both Voice and Voice I. Reserve existing
 // numbers first, then give colliding identities a deterministic unused number.
 let next=1;
 for(const part of unassigned){
  while(used.has(next))next++;
  assigned.set(part,next);used.add(next);
 }
 return {family,number:assigned.get(instrument)??null,icon:INSTRUMENT_BADGE_ICONS[family]};
}
