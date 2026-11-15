import {FACTORY_INSTRUMENTS,validateRoster,type Instrument} from './music';
export interface RosterPreset {name:string; instruments:Instrument[]}
const KEY='tango-arranger-roster-presets-v1';
const DEFAULT='tango-arranger-default-roster-v1';
/** Editable starting lineups, not claims about one canonical tango instrumentation. */
export const BUILTIN_ROSTERS:readonly RosterPreset[]=[
 {name:'Factory seven-part',instruments:[...FACTORY_INSTRUMENTS]},
 {name:'Quartet',instruments:['Piano','Contrabass','Violin I','Bandoneon I']},
 {name:'Sextet',instruments:['Piano','Contrabass','Violin I','Violin II','Bandoneon I','Bandoneon II']},
 {name:'Septet',instruments:[...FACTORY_INSTRUMENTS]},
 {name:'Orquesta típica',instruments:['Piano','Contrabass','Violin I','Violin II','Violin III','Violin IV','Bandoneon I','Bandoneon II','Bandoneon III','Bandoneon IV','Voice']}
];
export function listRosterPresets():RosterPreset[]{
  try {const value=JSON.parse(localStorage.getItem(KEY)||'[]');return [...BUILTIN_ROSTERS.map(p=>({...p,instruments:[...p.instruments]})),...(Array.isArray(value)?value.filter(p=>typeof p.name==='string'&&Array.isArray(p.instruments)&&!BUILTIN_ROSTERS.some(b=>b.name===p.name)).map(p=>({name:p.name,instruments:validateRoster(p.instruments)})):[])];}
  catch{return BUILTIN_ROSTERS.map(p=>({...p,instruments:[...p.instruments]}));}
}
export function saveRosterPreset(name:string,instruments:readonly Instrument[]):RosterPreset[]{
  const clean=name.trim();if(BUILTIN_ROSTERS.some(p=>p.name===clean))throw Error('Built-in presets cannot be overwritten');if(!clean||clean.length>80)throw Error('Preset name must be 1–80 characters');
  const roster=validateRoster(instruments);const presets=listRosterPresets().filter(p=>p.name!==clean);
  presets.push({name:clean,instruments:roster});localStorage.setItem(KEY,JSON.stringify(presets.filter(p=>!BUILTIN_ROSTERS.some(b=>b.name===p.name))));return presets;
}
export function removeRosterPreset(name:string):RosterPreset[]{
  if(BUILTIN_ROSTERS.some(p=>p.name===name))throw Error('Built-in presets cannot be deleted');const presets=listRosterPresets().filter(p=>p.name!==name);localStorage.setItem(KEY,JSON.stringify(presets.filter(p=>!BUILTIN_ROSTERS.some(b=>b.name===p.name))));return presets;
}
export function getDefaultRoster():Instrument[]{
  try{const saved=localStorage.getItem(DEFAULT);return saved?validateRoster(JSON.parse(saved)):[...FACTORY_INSTRUMENTS];}
  catch{return [...FACTORY_INSTRUMENTS];}
}
export function setDefaultRoster(instruments:readonly Instrument[]):void{localStorage.setItem(DEFAULT,JSON.stringify(validateRoster(instruments)));}
