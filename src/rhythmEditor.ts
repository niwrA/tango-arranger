import {INSTRUMENTS,generate,mergeScores,replaceInstrumentMeasure,type Instrument,type Note,type Project,type Score} from './music';

/** User-selectable tango rhythm templates, not literal transcriptions of historic orchestras.
 * Positions are in eighth-note slots across a reference 4/4 measure; they scale
 * proportionally to 2/4 and 3/4 so no tuplets or irregular notated fragments arise. */
export type RhythmPreset = 'marcato_four'|'marcato_two'|'syncopa'|'tres_tres_dos'|'habanera'|'offbeat'|'style'|'profile_darienzo'|'profile_disarli'|'profile_troilo'|'profile_pugliese'|'profile_fresedo'|'profile_canaro'|'profile_traditional';
export type RhythmMode = 'rhythm'|'accents';
export const RHYTHM_PRESETS:ReadonlyArray<{id:RhythmPreset;label:string;description:string}> = [
  {id:'style',label:'Current orchestra style',description:'Accents follow the selected orchestra profile; one pulse per beat.'},
  {id:'marcato_four',label:'Marcato en cuatro',description:'Four quarter-note pulses in 4/4, with accents on the main beats.'},
  {id:'marcato_two',label:'Marcato en dos',description:'Bass on beats 1 and 3; chord instruments answer on beats 2 and 4 in 4/4.'},
  {id:'syncopa',label:'Síncopa',description:'Offbeat attacks and syncopated emphasis.'},
  {id:'tres_tres_dos',label:'3–3–2',description:'Three attacks spaced 3, 3 and 2 eighth-note units.'},
  {id:'habanera',label:'Habanera-inspired',description:'Four attacks with 3–1–2–2 eighth-note spacing.'},
  {id:'offbeat',label:'Offbeat chords',description:'Short chord attacks between the main beats.'},
  {id:'profile_darienzo',label:'D’Arienzo-inspired',description:'Strong marcato en cuatro, a simplified profile heuristic.'},
  {id:'profile_disarli',label:'Di Sarli-inspired',description:'Spacious en dos with complementary bass and chord attacks.'},
  {id:'profile_troilo',label:'Troilo-inspired',description:'A syncopated pulse with offbeat emphasis.'},
  {id:'profile_pugliese',label:'Pugliese-inspired',description:'A strong first beat and a late-bar accent; simplified yumba-inspired gesture.'},
  {id:'profile_fresedo',label:'Fresedo-inspired',description:'Lighter en dos accompaniment.'},
  {id:'profile_canaro',label:'Canaro-inspired',description:'Regular marcato pulse with alternating accents.'},
  {id:'profile_traditional',label:'Traditional profile',description:'Regular marcato pulse with alternating accents.'}
];
export type RhythmSlot = {beat:number;duration:number;accent:boolean};
const round=(n:number)=>Math.round(n*1000000)/1000000;
export function rhythmSlots(preset:RhythmPreset,beats:number,inst:Instrument='Piano',profile='traditional'):RhythmSlot[]{
  if(!Number.isInteger(beats)||beats<2||beats>4)throw Error('Rhythm editor supports 2/4, 3/4 and 4/4');
  if(!RHYTHM_PRESETS.some(p=>p.id===preset))throw Error('Unknown rhythm preset');
  const bass=inst==='Contrabass'||inst==='Piano';
  let units:number[],accents:number[];
  switch(preset){
    case 'marcato_two': units=bass?[0,4]:[2,6];accents=[0,4,2,6];break;
    case 'syncopa': units=[0,3,4,7];accents=[3,7];break;
    case 'tres_tres_dos': units=[0,3,6];accents=[0,3,6];break;
    case 'habanera': units=[0,3,4,6];accents=[0,3];break;
    case 'offbeat': units=[1,3,5,7];accents=[1,5];break;
    case 'style':
    case 'profile_darienzo':case 'profile_disarli':case 'profile_troilo':case 'profile_pugliese':
    case 'profile_fresedo':case 'profile_canaro':case 'profile_traditional': {
      const style=preset==='style'?profile:preset.slice('profile_'.length);
      if(style==='disarli'||style==='fresedo'){units=bass?[0,4]:[2,6];accents=style==='fresedo'?[0,2]:[0,4];}
      else if(style==='troilo'){units=[0,3,4,7];accents=[3,7];}
      else{units=[0,2,4,6];accents=style==='darienzo'?[0,2,4,6]:style==='pugliese'?[0,6]:[0,4];}
      break;
    }
    default: units=[0,2,4,6];accents=[0,4];
  }
  const positions=units.map(n=>round(n*beats/8));
  return positions.map((beat,i)=>({beat,duration:round((i+1<positions.length?positions[i+1]:beats)-beat),accent:accents.includes(units[i])}));
}
/** Preserve pitch, chord voicing, note gestures and register. Chord notes sharing
 * an onset remain simultaneous. Piano bass and treble are handled independently,
 * so chord inversions never migrate to the F clef as a side effect of retiming. */
export function retimeMeasure(notes:Note[],inst:Instrument,barIndex:number,beats:number,slots:RhythmSlot[],mode:RhythmMode,splitPitch=60,upperSlots?:RhythmSlot[]):Note[]{
  const offset=barIndex*beats,end=offset+beats;
  const current=notes.filter(n=>n.start>=offset-1e-7&&n.start<end-1e-7).map(n=>({...n}));
  if(!current.length)return [];
  if(mode==='accents')return current.map(n=>{
    const noteSlots=inst==='Piano'&&n.pitch>=splitPitch&&upperSlots?upperSlots:slots;
    const near=noteSlots.reduce((best,slot)=>Math.abs(slot.beat-(n.start-offset))<Math.abs(best.beat-(n.start-offset))?slot:best,noteSlots[0]);
    return {...n,accent:near.accent,articulation:near.accent?'marcato_staccato':'staccato'};
  });
  if(mode!=='rhythm')throw Error('Unknown rhythm application mode');
  const groups:Note[][]=[];
  const byRegister=inst==='Piano'?[current.filter(n=>n.pitch<splitPitch),current.filter(n=>n.pitch>=splitPitch)]:[current];
  for(const [voiceIndex,voice] of byRegister.entries()){
    if(!voice.length)continue;
    const activeSlots=inst==='Piano'&&voiceIndex===1&&upperSlots?upperSlots:slots;
    const byOnset=new Map<number,Note[]>();
    for(const n of voice){const k=round(n.start-offset);const chord=byOnset.get(k)??[];chord.push(n);byOnset.set(k,chord);}
    const originals=[...byOnset.entries()].sort((a,b)=>a[0]-b[0]).map(x=>x[1]);
    for(let i=0;i<activeSlots.length;i++){
      const slot=activeSlots[i],chord=originals[Math.floor(i*originals.length/activeSlots.length)];
      groups.push(chord.map(n=>({...n,start:round(offset+slot.beat),duration:slot.duration,
        accent:slot.accent,articulation:slot.accent?'marcato_staccato':'staccato',
        // Keep existing technique and gate unless the source had no custom gate.
        source:'manual' as const})));
    }
  }
  return groups.flat().sort((a,b)=>a.start-b.start||a.pitch-b.pitch);
}
export type RhythmApplication={instruments:Instrument[];measures:number[];preset:RhythmPreset;mode:RhythmMode;overwriteProtected?:boolean};
export type RhythmApplyResult={project:Project;updated:number;skippedProtected:number;skippedEmpty:number};
export function applyRhythmPreset(p:Project,source:Score|undefined,options:RhythmApplication):RhythmApplyResult{
  if(!options.instruments.length||!options.measures.length)throw Error('Choose instruments and measures');
  if(!['rhythm','accents'].includes(options.mode))throw Error('Invalid rhythm mode');
  const instruments=[...new Set(options.instruments)];
  const measures=[...new Set(options.measures)].sort((a,b)=>a-b);
  if(instruments.some(i=>!INSTRUMENTS.includes(i))||measures.some(i=>!Number.isInteger(i)||i<0||i>=p.bars.length))throw Error('Invalid rhythm targets');
  let next=p,updated=0,skippedProtected=0,skippedEmpty=0;
  let current=source??p.generatedScore??mergeScores(p,generate(p));
  for(const b of measures){
    for(const inst of instruments){
      const key=`${inst}:${b}`;
      if(next.protectedBars[key]&&!options.overwriteProtected){skippedProtected++;continue;}
      const original=current[inst]?.filter(n=>Math.floor((n.start+1e-7)/p.beats)===b)??[];
      if(!original.length){skippedEmpty++;continue;}
      const slots=rhythmSlots(options.preset,p.beats,inst,p.profile);
      const upperSlots=inst==='Piano'&&(['marcato_two','profile_disarli','profile_fresedo'].includes(options.preset)||options.preset==='style'&&['disarli','fresedo'].includes(p.profile))?rhythmSlots(options.preset,p.beats,'Bandoneon I',p.profile):undefined;
      const notes=retimeMeasure(original,inst,b,p.beats,slots,options.mode,p.pianoSplitPitch??60,upperSlots);
      next=replaceInstrumentMeasure(next,current,inst,b,notes);
      current=next.generatedScore!;
      updated++;
    }
  }
  return {project:next,updated,skippedProtected,skippedEmpty};
}
