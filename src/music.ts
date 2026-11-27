import {bandoneonHandForPitch,bandoneonModelForPart,bandoneonProfile,isBandoneonPitchPlayable,type BandoneonModelId} from './bandoneon';
import type {TempoExpressions} from './tempoExpressions';
import {validateGesture,transposeTangoGesture,type TangoGesture} from './tangoGestures';
import type {MergeBackup,MergePlan} from './musicXmlMerge';
import type {RhythmAttachment} from './rhythmSnap';
import {effectiveRole,effectiveActivity,effectiveViolinTechnique,effectiveBassTechnique,plannedArticulation,plannedMeasureActive,phraseAt,phraseMeasureMap,type Phrase,type PhrasePlan} from './phrasePlan';
export type Instrument = string;
export const FACTORY_INSTRUMENTS: readonly Instrument[] = ['Piano','Contrabass','Violin I','Violin II','Bandoneon I','Bandoneon II','Voice'];
/** Reactive UI compatibility: mutate in place when switching projects. Engine functions use project roster. */
export const INSTRUMENTS: Instrument[] = [...FACTORY_INSTRUMENTS];
export type InstrumentFamily = 'Piano'|'Contrabass'|'Violin'|'Bandoneon'|'Voice'|'Guitar'|'Clarinet'|'Flute'|'Trumpet'|'Trombone';
export const INSTRUMENT_FAMILIES:readonly InstrumentFamily[]=['Violin','Voice','Bandoneon','Piano','Contrabass','Guitar','Clarinet','Flute','Trumpet','Trombone'];
export const INSTRUMENT_CAPABILITIES:Record<InstrumentFamily,{clef:'G'|'F';staves:1|2;transposition:number;range:[number,number];polyphonic:boolean;program:number}>={
  Piano:{clef:'G',staves:2,transposition:0,range:[21,108],polyphonic:true,program:0},
  Contrabass:{clef:'F',staves:1,transposition:-12,range:[28,55],polyphonic:false,program:43},
  Violin:{clef:'G',staves:1,transposition:0,range:[55,96],polyphonic:false,program:40},
  Bandoneon:{clef:'G',staves:1,transposition:0,range:[...bandoneonProfile().range],polyphonic:true,program:21},
  Voice:{clef:'G',staves:1,transposition:0,range:[24,108],polyphonic:false,program:52},
  Guitar:{clef:'G',staves:1,transposition:-12,range:[40,88],polyphonic:true,program:24},
  Clarinet:{clef:'G',staves:1,transposition:-2,range:[50,94],polyphonic:false,program:71},
  Flute:{clef:'G',staves:1,transposition:0,range:[60,96],polyphonic:false,program:73},
  Trumpet:{clef:'G',staves:1,transposition:-2,range:[54,82],polyphonic:false,program:56},
  Trombone:{clef:'F',staves:1,transposition:0,range:[40,77],polyphonic:false,program:57}
};
export function instrumentFamily(inst:Instrument):InstrumentFamily {
  if(inst.startsWith('Violin'))return 'Violin';
  if(inst.startsWith('Bandoneon'))return 'Bandoneon';
  if(inst.startsWith('Voice'))return 'Voice';
  if(inst.startsWith('Piano'))return 'Piano';
  if(inst.startsWith('Contrabass'))return 'Contrabass';
  for(const family of INSTRUMENT_FAMILIES)if(inst===family||inst.startsWith(family+' '))return family;
  throw Error(`Unsupported instrument family: ${inst}`);
}
export function projectInstruments(p:Pick<Project,'instruments'>):Instrument[]{return p.instruments?.length?[...p.instruments]:[...FACTORY_INSTRUMENTS];}
export function syncActiveInstruments(p:Pick<Project,'instruments'>):void {INSTRUMENTS.splice(0,INSTRUMENTS.length,...projectInstruments(p));}
export function validateRoster(roster:readonly string[]):Instrument[]{
  if(!roster.length||roster.length>32||new Set(roster).size!==roster.length)throw Error('Roster must contain 1–32 unique parts');
  for(const name of roster){if(!/^(Piano( [IVX]+)?|Contrabass( [IVX]+)?|Violin( [IVX]+)?|Bandoneon( [IVX]+)?|Voice( [IVX]+)?|Guitar( [IVX]+)?|Clarinet( [IVX]+)?|Flute( [IVX]+)?|Trumpet( [IVX]+)?|Trombone( [IVX]+)?)$/.test(name))throw Error(`Unsupported part: ${name}`);}
  return [...roster];
}
export function setProjectRoster(p:Project,roster:readonly string[]):Project{
  const instruments=validateRoster(roster);
  const next:Project={...p,instruments,roles:Object.fromEntries(Object.entries(p.roles).map(([section,roles])=>[section,Object.fromEntries(instruments.map(inst=>[inst,roles[inst]??(inst.startsWith('Voice')&&inst!=='Voice'?'harmony':'rest')]))]))};
  next.generatedScore=undefined;
  return next;
}
/** Functional orchestra groups are user-editable and independent of A/B/C song parts.
 * Defaults are starting points, not assertions about an instrument's musical role. */
export type InstrumentGroup = 'rhythm'|'melody'|'harmony';
export const INSTRUMENT_GROUPS:Readonly<Record<InstrumentGroup,readonly Instrument[]>>={
  rhythm:['Piano','Contrabass'],
  melody:['Violin I','Bandoneon I','Voice'],
  harmony:['Violin II','Bandoneon II']
};
export function instrumentsForGroup(project:Pick<Project,'orchestralGroups'>,group:InstrumentGroup,available:readonly Instrument[]=INSTRUMENTS):Instrument[]{
  const configured=project.orchestralGroups?.[group]?.length?project.orchestralGroups[group]!:INSTRUMENT_GROUPS[group];
  return available.filter(inst=>configured.includes(inst));
}

export type Role = 'melody'|'harmony'|'chords'|'bass'|'fill'|'variation'|'rest';
export type Articulation = 'auto'|'marcato_staccato'|'staccato'|'legato';
/** duration is the written rhythmic value. gate optionally overrides the sounding
 * fraction (0 < gate <= 1), without changing MusicXML note/rest durations. */
export type PianoGlissando={interval:number;keys:'white'|'black'|'chromatic';beats:number};
export type StringGlissando={interval:number;beats:number};
export type BowedTremolo={strokes:1|2|3;rateHz?:number;mode?:'measured'|'unmeasured'};
export type Note = { editId?:string; staffOverride?:1|2; xmlOctaveShift?:number; pianoPedalOffset?:number; stringGlissando?:StringGlissando; bowedTremolo?:BowedTremolo; pianoGlissando?:PianoGlissando; pianoPedalBeats?:number; leadToken?:string; lyric?:string; lyric2?:string; syllabic2?:'single'|'begin'|'middle'|'end'; melisma?:boolean; melisma2?:boolean; syllabic?:'single'|'begin'|'middle'|'end'; articulation?:Exclude<Articulation,'auto'>; pitch:number; start:number; duration:number; gate?:number; velocity?:number; accent?:boolean; technique?:'pizzicato'|'arco'; source?:'generated'|'imported'|'manual'; slideTo?:number; approachSlideFrom?:number; vibrato?:boolean; swellTo?:number; subito?:DynamicMark; gesture?:TangoGesture; rhythmSource?:RhythmAttachment; xmlStaff?:number; xmlVoice?:string; xmlTieContinuation?:boolean; stringMidi?:number; handPosition?:string; bowDirection?:'up'|'down'; finger?:'0'|'1'|'2'|'3'|'4'|'T' };
/** Convert a linked glissando to a playback-only contour. */
export function stringGlissandoPlayback(note:Note,from=note.start,to=Infinity):Note{
 const gliss=note.stringGlissando;
 if(!gliss)return note;
 const start=Math.max(from,note.start),end=Math.min(to,note.start+gliss.beats);
 if(end<=start)return {...note,stringGlissando:undefined};
 const pitchAt=(beat:number)=>note.pitch+gliss.interval*(beat-note.start)/gliss.beats;
 const pitch=pitchAt(start),target=pitchAt(end);
 return {...note,pitch,start,duration:end-start,gate:1,stringGlissando:undefined,
  gesture:{kind:'portamento',contour:gliss.interval>0?'up':'down',points:[{at:0,pitch},{at:1,pitch:target}]}};
}
/** Instantaneous sounding pitch of a linked slide; score pitches remain integer. */
export function stringPitchAtBeat(n:Note,beat:number):number{
 const g=n.stringGlissando;
 return g?n.pitch+g.interval*Math.max(0,Math.min(1,(beat-n.start)/g.beats)):n.pitch;
}
/** Tango playback heuristics, not universal performance prescriptions. */
export const ARTICULATION_GATES:Readonly<Record<Exclude<Articulation,'auto'>,number>>={
  staccato:0.28,marcato_staccato:0.58,legato:0.94
};
/** A note's audible duration in beats; never alter its written duration. */
export function noteSoundingDuration(n:Note):number {
  const gate=n.gate??(n.articulation?ARTICULATION_GATES[n.articulation]:0.90);
  if(!Number.isFinite(gate)||gate<=0||gate>1)throw Error('Note gate must be greater than 0 and at most 1');
  return n.duration*gate;
}
/** Marcato receives a stronger attack than staccato at equal base velocity. */
export function noteSoundingVelocity(n:Note):number {
  return Math.max(1,Math.min(127,(n.velocity??80)+(n.articulation==='marcato_staccato'?14:0)));
}

export type Difficulty = 'easy'|'intermediate'|'advanced';
export type DynamicMark = 'ppp'|'pp'|'p'|'mp'|'mf'|'f'|'ff'|'fff';
export const DYNAMIC_MARKS:DynamicMark[]=['ppp','pp','p','mp','mf','f','ff','fff'];
export const DYNAMIC_VELOCITIES:Record<DynamicMark,number>={ppp:38,pp:52,p:63,mp:74,mf:88,f:101,ff:112,fff:122};
export type MeasureDynamics={start?:DynamicMark;end?:DynamicMark};
export type MelodyDucking={enabled:boolean;reduction:number};
/** Explicit per-instrument measure endpoints; unspecified endpoints inherit prior dynamics. */
export function measureDynamicVelocity(p:Pick<Project,'measureDynamics'|'beats'>,inst:Instrument,absoluteBeat:number,base:number):number {
 const bar=Math.max(0,Math.floor(absoluteBeat/p.beats));
 const settings=p.measureDynamics?.[`${inst}:${bar}`];if(!settings)return base;
 const start=settings.start?DYNAMIC_VELOCITIES[settings.start]:undefined;
 const end=settings.end?DYNAMIC_VELOCITIES[settings.end]:undefined;
 if(start===undefined&&end===undefined)return base;
 if(start!==undefined&&end!==undefined){const t=Math.max(0,Math.min(1,(absoluteBeat-bar*p.beats)/p.beats));return Math.max(1,Math.min(127,Math.round(base+(start+(end-start)*t-88))));}
 return Math.max(1,Math.min(127,Math.round(base+(start??end??88)-88)));
}
export function melodyDuckingFactor(p:Pick<Project,'melodyDucking'|'roles'|'measureRoles'|'bars'|'beats'|'instruments'|'phrasePlan'>,inst:Instrument,absoluteBeat:number):number {
 if(inst.startsWith('Contrabass')||p.melodyDucking?.enabled===false)return 1;
 const b=Math.floor(absoluteBeat/p.beats),bar=p.bars[b];if(!bar)return 1;
 const phrase=phraseAt(p,b)??null;
 const lead=effectiveRole(p,inst,b,phrase);if(lead==='melody')return 1;
 const group=p.phrasePlan?projectInstruments(p):INSTRUMENTS;
 const hasLead=group.some(i=>i!==inst&&effectiveRole(p,i,b,phrase)==='melody'&&plannedMeasureActive(p,i,b,phrase)!==false);
 return hasLead?Math.max(0.1,Math.min(1,(100-(p.melodyDucking?.reduction??22))/100)):1;
}
export type InstrumentSettings = { difficulty?:Difficulty; activity?:number; dynamicsOffset?:number };
export type ExpressionSettings = { enabled:boolean; sections:Record<string,DynamicMark>; crescendo:boolean };
export const defaultInstrumentSettings=():Partial<Record<Instrument,InstrumentSettings>>=>({Piano:{difficulty:'advanced',activity:1},Contrabass:{difficulty:'advanced',activity:1},'Violin I':{difficulty:'advanced',activity:0.92},'Violin II':{difficulty:'advanced',activity:0.88},'Bandoneon I':{difficulty:'advanced',activity:0.93},'Bandoneon II':{difficulty:'advanced',activity:0.85},Voice:{difficulty:'easy',activity:0}});
export const defaultExpression=():ExpressionSettings=>({enabled:true,sections:{A1:'mp',B1:'mf',A2:'mp',B2:'f',C:'f'},crescendo:true});
/** Editable, deterministic arranging figures. These are stylistic building blocks,
 * not a claim that any composer used one invariant accompaniment pattern. */
export type FigureKind = 'notes_up'|'notes_down'|'chords_up'|'chords_down'|'countermelody'|'melody_response';
export const FIGURE_KINDS:FigureKind[]=['notes_up','notes_down','chords_up','chords_down','countermelody','melody_response'];
export type ExpressionRange={instrument:Instrument;startMeasure:number;endMeasure:number;startBeat?:number;endBeat?:number;from:number;to:number};
export function expressionVelocity(p:Pick<Project,'expressionRanges'|'beats'>,inst:Instrument,absoluteBeat:number,base:number):number {
  let velocity=base;
  for(const range of p.expressionRanges??[]){
    if(range.instrument!==inst)continue;
    const start=range.startMeasure*p.beats+(range.startBeat??0),end=range.endMeasure*p.beats+(range.endBeat??p.beats);
    if(absoluteBeat<start||absoluteBeat>=end)continue;
    const t=Math.max(0,Math.min(1,(absoluteBeat-start)/Math.max(0.001,end-start)));
    velocity+=Math.round(range.from+(range.to-range.from)*t-80);
  }
  return Math.max(1,Math.min(127,Math.round(velocity)));
}
export type BassTechnique = 'traditional'|'pizzicato'|'arco_legato'|'marcato'|'walking'|'habanera';
export const BASS_TECHNIQUES:BassTechnique[]=['traditional','pizzicato','arco_legato','marcato','walking','habanera'];
export type ViolinTechnique = 'tango_staccato'|'arpeggio'|'pizzicato'|'pizzicato_arpeggio'|'double_stop'|'sustained'|'block';
export type ViolinPart = 'Violin I'|'Violin II';
export type ArpeggioDirection = 'up'|'down'|'alternate';
export type FollowTarget = 'independent'|'Piano'|'Violin I'|'Violin II'|'Bandoneon I';
export type FollowMethod = 'exact'|'octave'|'adapt'|'rhythm';
export type OrchestrationSettings = { contrabass?:Record<string,BassTechnique>; violin:Record<string,Partial<Record<'Violin I'|'Violin II',ViolinTechnique>>>; bandoneon:Record<string,Partial<Record<'Bandoneon I'|'Bandoneon II',{target:FollowTarget;method:FollowMethod}>>> };
export const defaultOrchestration=():OrchestrationSettings=>({contrabass:{},violin:{A1:{'Violin II':'pizzicato'},B1:{'Violin II':'tango_staccato'},A2:{'Violin I':'tango_staccato'},B2:{'Violin II':'pizzicato'},C:{'Violin II':'tango_staccato'}},bandoneon:{A1:{'Bandoneon I':{target:'Violin II',method:'adapt'}},B1:{'Bandoneon I':{target:'Violin II',method:'adapt'},'Bandoneon II':{target:'Piano',method:'rhythm'}},A2:{'Bandoneon I':{target:'Violin II',method:'adapt'}},B2:{'Bandoneon I':{target:'Violin II',method:'adapt'},'Bandoneon II':{target:'Piano',method:'rhythm'}},C:{'Bandoneon I':{target:'Violin II',method:'adapt'}}}});
/** A concert-pitch key signature, independent of the section's chord progression. */
export type KeySignature = string;
export const KEY_SIGNATURES:Readonly<Record<string,{fifths:number;mode:'major'|'minor'}>> = {
  Cb:{fifths:-7,mode:'major'},Gb:{fifths:-6,mode:'major'},Db:{fifths:-5,mode:'major'},Ab:{fifths:-4,mode:'major'},Eb:{fifths:-3,mode:'major'},Bb:{fifths:-2,mode:'major'},F:{fifths:-1,mode:'major'},C:{fifths:0,mode:'major'},G:{fifths:1,mode:'major'},D:{fifths:2,mode:'major'},A:{fifths:3,mode:'major'},E:{fifths:4,mode:'major'},B:{fifths:5,mode:'major'},'F#':{fifths:6,mode:'major'},'C#':{fifths:7,mode:'major'},
  Abm:{fifths:-7,mode:'minor'},Ebm:{fifths:-6,mode:'minor'},Bbm:{fifths:-5,mode:'minor'},Fm:{fifths:-4,mode:'minor'},Cm:{fifths:-3,mode:'minor'},Gm:{fifths:-2,mode:'minor'},Dm:{fifths:-1,mode:'minor'},Am:{fifths:0,mode:'minor'},Em:{fifths:1,mode:'minor'},Bm:{fifths:2,mode:'minor'},'F#m':{fifths:3,mode:'minor'},'C#m':{fifths:4,mode:'minor'},'G#m':{fifths:5,mode:'minor'},'D#m':{fifths:6,mode:'minor'},'A#m':{fifths:7,mode:'minor'}
};
export const MAJOR_KEYS=Object.keys(KEY_SIGNATURES).filter(k=>KEY_SIGNATURES[k].mode==='major');
export const MINOR_KEYS=Object.keys(KEY_SIGNATURES).filter(k=>KEY_SIGNATURES[k].mode==='minor');
export function parseKeySignature(key:string){const result=KEY_SIGNATURES[key];if(!result||!Number.isInteger(result.fifths))throw Error(`Unsupported key signature: ${key}`);return result;}
export function sectionKey(p:Project,section:string):string{return p.sectionKeys?.[section]??'C';}
export function transposeKeySignature(key:string,semitones:number):string {
  const {mode,fifths}=parseKeySignature(key);
  if(!Number.isInteger(semitones)||Math.abs(semitones)>24)throw Error('Invalid transpose');
  if(semitones%12===0)return key;
  const pc=parsePitch(key.replace(/m$/,'')+'4')!%12;
  const target=(pc+semitones%12+12)%12;
  const candidates=Object.keys(KEY_SIGNATURES).filter(k=>KEY_SIGNATURES[k].mode===mode&&parsePitch(k.replace(/m$/,'')+'4')!%12===target);
  return candidates.sort((a,b)=>Math.abs(KEY_SIGNATURES[a].fifths)-Math.abs(KEY_SIGNATURES[b].fifths)||Math.abs(KEY_SIGNATURES[a].fifths-fifths)-Math.abs(KEY_SIGNATURES[b].fifths-fifths))[0]??key;
}
/** Older .tango projects had no key signatures. Infer an initial editable guess
 * from the first simple chord of each section; this is not harmonic analysis. */
export function inferSectionKeys(p:Project):Record<string,string>{
  const keys:Record<string,string>={};
  for(const bar of p.bars){if(keys[bar.section])continue;
    const chord=bar.chord.split(',')[0]?.trim()??'';
    const match=chord.match(/^([A-G][#b]?)(m(?!aj))?/);
    const candidate=match?match[1]+(match[2]?'m':''):'C';
    keys[bar.section]=KEY_SIGNATURES[candidate]?candidate:'C';
  }
  return keys;
}
/** Ordered score sections are contiguous runs, not merely unique names. */
export type SectionSpan = {label:string; start:number; measures:number};
export function sectionLetter(index:number):string {
  if(!Number.isInteger(index)||index<0)throw Error('Invalid section index');
  let n=index+1, result='';
  while(n>0){n--;result=String.fromCharCode(65+n%26)+result;n=Math.floor(n/26);}
  return result;
}
export function openingPickupBeats(p:Pick<Project,'bars'|'beats'>):number {
  const length=p.bars[0]?.pickupBeats??0;
  return p.bars.length>1&&Number.isInteger(length)&&length>0&&length<p.beats?length:0;
}
export function sectionSpans(p:Pick<Project,'bars'> & Partial<Pick<Project,'beats'>>):SectionSpan[]{
  const spans:SectionSpan[]=[];
  const first=p.beats!==undefined&&openingPickupBeats({bars:p.bars,beats:p.beats})?1:0;
  p.bars.forEach((bar,i)=>{if(i<first)return;const last=spans.at(-1);if(last&&last.label===bar.section)last.measures++;else spans.push({label:bar.section,start:i,measures:1});});
  return spans;
}
/** Copy the chord progression from one section to another by measure offset.
 * Only harmony changes: melodies, section keys, orchestration, manual notes and
 * protection flags remain intact. For unequal lengths, copy the shared prefix;
 * excess destination measures are left untouched. All source chords are checked
 * before applying any change, so invalid legacy entries cannot partially copy.
 */
export function copySectionChords(p:Project,sourceIndex:number,destinationIndex:number):{
  project:Project;copied:number;changed:number;sourceMeasures:number;destinationMeasures:number
} {
  const spans=sectionSpans(p);
  if(!Number.isInteger(sourceIndex)||!Number.isInteger(destinationIndex)||
     sourceIndex<0||destinationIndex<0||sourceIndex>=spans.length||destinationIndex>=spans.length)
    throw Error('Choose an existing source and destination section');
  if(sourceIndex===destinationIndex)throw Error('Choose two different sections');
  const source=spans[sourceIndex],destination=spans[destinationIndex];
  const copied=Math.min(source.measures,destination.measures);
  const chords=Array.from({length:copied},(_,offset)=>{
    const chord=p.bars[source.start+offset].chord;
    parseChordSequence(chord,p.beats); // validate before making any changes
    return chord;
  });
  const bars=p.bars.map(bar=>({...bar}));
  let changed=0;
  for(let offset=0;offset<copied;offset++){
    const index=destination.start+offset;
    if(bars[index].chord!==chords[offset])changed++;
    bars[index].chord=chords[offset];
  }
  return {project:{...p,bars,generatedScore:changed?undefined:p.generatedScore},
    copied,changed,sourceMeasures:source.measures,destinationMeasures:destination.measures};
}

/** Rebuild the song structure while retaining notes/chords in corresponding
 * sections. New measures are genuinely blank; deleted measures are discarded.
 * Existing note-event scores and protections are invalidated because their
 * absolute beat offsets cannot safely survive a structural edit.
 */
export function resizeSections(p:Project,lengths:number[]):Project {
  if(!lengths.length||lengths.length>26||lengths.some(n=>!Number.isInteger(n)||n<1||n>128)||lengths.reduce((a,b)=>a+b,0)+(openingPickupBeats(p)?1:0)>512)
    throw Error('Use 1–26 sections, 1–128 measures each, maximum 512 measures total');
  const old=sectionSpans(p),bars:Bar[]=[],indexMap=new Map<number,number>();
  if(openingPickupBeats(p)){bars.push({...p.bars[0],section:sectionLetter(0)});indexMap.set(0,0);}
  const sectionKeys:Record<string,string>={},roles:Project['roles']={},contrabass:Record<string,BassTechnique>={},violin:OrchestrationSettings['violin']={},bandoneon:OrchestrationSettings['bandoneon']={},dynamics:Record<string,DynamicMark>={},violinMarcatoBeats:NonNullable<Project['violinMarcatoBeats']>={},violinArpeggioDirections:NonNullable<Project['violinArpeggioDirections']>={};
  const oldOrch=p.orchestration??defaultOrchestration();
  const defaults=defaultRoles(),defaultDyn=defaultExpression();
  for(let si=0;si<lengths.length;si++){
    const label=sectionLetter(si),span=old[si],source=span?.label;
    sectionKeys[label]=source?sectionKey(p,source):'C';
    roles[label]={...(source?p.roles[source]:defaults[['A1','B1','A2','B2','C'][si%5]]??{})};
    violin[label]={...(source?oldOrch.violin[source]:{})};
    contrabass[label]=source?(oldOrch.contrabass?.[source]??'traditional'):'traditional';
    violinMarcatoBeats[label]=source?Object.fromEntries(Object.entries(p.violinMarcatoBeats?.[source]??{}).map(([inst,beats])=>[inst,[...beats]])):{};
    violinArpeggioDirections[label]={...(source?p.violinArpeggioDirections?.[source]:{})};
    bandoneon[label]={...(source?oldOrch.bandoneon[source]:{'Bandoneon I':{target:'Violin II',method:'adapt'}})};
    dynamics[label]=source?(p.expression?.sections[source]??'mf'):(defaultDyn.sections[label]??'mf');
    for(let j=0;j<lengths[si];j++){
      const oldIndex=span&&j<span.measures?span.start+j:-1;
      if(oldIndex>=0){indexMap.set(oldIndex,bars.length);const oldBar=p.bars[oldIndex];bars.push({...oldBar,section:label,melody:oldBar.melody.map(n=>({...n}))});}
      else bars.push({chord:'',melody:[],section:label});
    }
  }
  const remap=<T>(source:Record<string,T>|undefined):Record<string,T>=>{
    const result:Record<string,T>={};
    for(const [key,value] of Object.entries(source??{})){
      const match=key.match(/^(.*):(\d+)$/);if(!match)continue;
      const next=indexMap.get(Number(match[2]));if(next!==undefined)result[`${match[1]}:${next}`]=value;
    }
    return result;
  };
  const remapTempoExpressions=():TempoExpressions|undefined=>{
    if(!p.tempoExpressions)return undefined;
    const e=p.tempoExpressions;
    const shift=(m:number)=>indexMap.get(m);
    return {
      ritardandos:e.ritardandos.flatMap(r=>{
        const start=shift(r.startMeasure),end=shift(r.endMeasure);
        return start!==undefined&&end!==undefined&&end-start===r.endMeasure-r.startMeasure
          ?[{...r,startMeasure:start,endMeasure:end}]:[];
      }),
      fermatas:e.fermatas.flatMap(f=>{
        const measure=shift(f.measure);return measure===undefined?[]:[{...f,measure}];
      }),
      aTempoMeasures:e.aTempoMeasures.flatMap(m=>{
        const measure=shift(m);return measure===undefined?[]:[measure];
      })
    };
  };
  return {...p,bars,sectionKeys,roles,tempoExpressions:remapTempoExpressions(),
    orchestration:{contrabass,violin,bandoneon},violinMarcatoBeats,violinArpeggioDirections,expression:{...(p.expression??defaultExpression()),sections:dynamics},
    pianoFigures:Object.fromEntries(lengths.map((_,i)=>[sectionLetter(i),p.pianoFigures?.[old[i]?.label]??'chords_up'])),
    pianoFigureVariation:Object.fromEntries(lengths.map((_,i)=>[sectionLetter(i),p.pianoFigureVariation?.[old[i]?.label]??0])),
    expressionRanges:[],measureDynamics:{}, // old absolute measure positions are invalid after restructuring

    measureRoles:remap(p.measureRoles),measureViolinTechniques:remap(p.measureViolinTechniques),measureBassTechniques:remap(p.measureBassTechniques),
    articulation:{...(p.articulation??defaultArticulation()),overrides:remap(p.articulation?.overrides)},
    generatedScore:undefined,importedScore:undefined,baseScore:undefined,protectedBars:{},partEditions:undefined,phrasePlan:undefined};
}
export type Bar = { chord:string; melody:Note[]; section:string; pickupBeats?:number };
export type Score = Record<Instrument,Note[]>;
export type PartEdition={notes:Note[]; importedNotes?:Note[]; protectedMeasures:number[]; sourceSignature:string; generatedAt?:string};
export type PartEditions=Partial<Record<Instrument,Partial<Record<Difficulty,PartEdition>>>>;
export type Project = { version:1; nextMusicalEditId?:number; tempoExpressions?:TempoExpressions; leadLyrics?:Record<string,{source:string;useExistingMelody:boolean}>; importMergeBackup?:MergeBackup; importReference?:{sourceName:string;sourceXml:string;plan:MergePlan;savedAt:string}; phrasePlan?:PhrasePlan; partEditions?:PartEditions; bandoneonGrandStaff?:Record<string,boolean>; bandoneonModels?:Record<string,BandoneonModelId>; instrumentNames?:Record<string,string>; lyricOverflow?:Record<string,[unknown,unknown,unknown][]>; lyricSequences?:Record<string,{text:string;syllabic?:string;melisma?:boolean}[]>; instruments?:Instrument[]; orchestralGroups?:Partial<Record<InstrumentGroup,Instrument[]>>; sectionKeys?:Record<string,KeySignature>; pianoSplitPitch?:number; pianoFigures?:Record<string,FigureKind>; pianoFigureVariation?:Record<string,number>; expressionRanges?:ExpressionRange[]; measureDynamics?:Record<string,MeasureDynamics>; melodyDucking?:MelodyDucking; transposeSemitones?:number; adaptiveTranspose?:AdaptiveTranspose; tuning?:{a4Hz:number;overrides?:Record<string,number>}; articulation?:{phraseBars:number; enabled:boolean; overrides:Record<string,Exclude<Articulation,'auto'>>}; title:string; bpm:number; beats:number; profile:string; bars:Bar[]; roles:Record<string,Partial<Record<Instrument,Role>>>; protectedBars:Record<string,boolean>; measureRoles?:Record<string,Role>; measureViolinTechniques?:Record<string,ViolinTechnique>; measureBassTechniques?:Record<string,BassTechnique>; violinMarcatoBeats?:Record<string,Partial<Record<ViolinPart,number[]>>>; violinArpeggioDirections?:Record<string,Partial<Record<ViolinPart,ArpeggioDirection>>>; orchestration?:OrchestrationSettings; difficulty?:Difficulty; instrumentSettings?:Partial<Record<Instrument,InstrumentSettings>>; expression?:ExpressionSettings; importedScore?:Score; generatedScore?:Score; baseScore?:Score };
export type RegisterStrategy='auto'|'individual'|'whole'|'phrase'|'exact';
export type RegisterPartSetting={strategy:RegisterStrategy;octaves?:-24|-12|0|12|24};
export type AdaptiveTranspose={enabled:boolean;chordToneRhythm:boolean;semitones:number;parts?:Record<string,RegisterPartSetting>};
export type TransposeCorrection={instrument:Instrument;measure:number;start:number;originalPitch:number;intendedPitch:number;suggestedPitch:number;strategy:'octave'|'chord-tone'|'unresolved'|'whole'|'phrase';};
export type RegisterDecision={instrument:Instrument;strategy:RegisterStrategy;octaves:number;outOfRange:number;unresolved:number;};
function nearestPlayablePitch(pitch:number,low:number,high:number,tones?:number[],playable?:(pitch:number)=>boolean):{pitch:number;strategy:'octave'|'chord-tone'|'unresolved'}{
 const octave:number[]=[];
 for(let n=low;n<=high;n++)if((n-pitch)%12===0&&(!playable||playable(n)))octave.push(n);
 if(octave.length)return {pitch:octave.reduce((a,b)=>Math.abs(a-pitch)<=Math.abs(b-pitch)?a:b),strategy:'octave'};
 if(tones?.length){const candidates=Array.from({length:high-low+1},(_,i)=>low+i).filter(n=>tones.includes(((n%12)+12)%12)&&(!playable||playable(n)));
  if(candidates.length)return {pitch:candidates.reduce((a,b)=>Math.abs(a-pitch)<=Math.abs(b-pitch)?a:b),strategy:'chord-tone'};
 }
 return {pitch,strategy:'unresolved'};
}
function chordAtNote(p:Project,n:Note):string{
 const measure=Math.max(0,Math.min(p.bars.length-1,Math.floor(n.start/p.beats)));
 const parts=(p.bars[measure]?.chord??'').split(',').map(c=>c.trim()).filter(Boolean);
 return parts[Math.min(parts.length-1,Math.floor((n.start-measure*p.beats)/Math.max(1e-6,p.beats/Math.max(1,parts.length))))]??'';
}
function noteFits(n:Note,offset:number,low:number,high:number,playable?:(pitch:number)=>boolean):boolean{
 const pitches=[n.pitch,n.slideTo,n.approachSlideFrom];
 if(playable&&n.gesture)pitches.push(...n.gesture.points.map(pt=>pt.pitch),...(n.gesture.partner??[]).map(pt=>pt.pitch));
 return pitches.every(v=>v===undefined||(v+offset>=low&&v+offset<=high&&(!playable||playable(v+offset))));
}
function bestOctave(notes:Note[],semitones:number,low:number,high:number,playable?:(pitch:number)=>boolean):number|null{
 const options=[0,12,-12,24,-24].filter(o=>notes.every(n=>noteFits(n,semitones+o,low,high,playable)));
 return options.length?options.sort((a,b)=>Math.abs(a)-Math.abs(b))[0]:null;
}
/** Register boundaries follow the score, not fixed-size measure buckets.
 * Written durations protect sustained notes; playback gates are irrelevant here.
 * A half-beat silence is a conservative heuristic, not a formal phrase analysis. */
export function phraseGroups(notes:Note[],p:Project):Note[][]{
 const epsilon=1e-6,groups:Note[][]=[],planned=phraseMeasureMap(p);
 const boundaries:number[]=[];
 for(let bar=1;bar<p.bars.length;bar++){
  if(p.bars[bar].section!==p.bars[bar-1].section||planned[bar]!==planned[bar-1])boundaries.push(bar*p.beats);
 }
 const sorted=[...notes].sort((a,b)=>a.start-b.start);
 let group:Note[]=[],end=-Infinity,lastStart=-Infinity,boundaryIndex=0,pending=false;
 for(let i=0;i<sorted.length;){
  const start=sorted[i].start,onset:Note[]=[];
  while(i<sorted.length&&Math.abs(sorted[i].start-start)<=epsilon)onset.push(sorted[i++]);
  while(boundaryIndex<boundaries.length&&boundaries[boundaryIndex]<=start+epsilon){
   if(boundaries[boundaryIndex]>lastStart+epsilon)pending=true;
   boundaryIndex++;
  }
  const safe=start>=end-epsilon&&!onset.some(n=>n.xmlTieContinuation);
  if(group.length&&safe&&(pending||start-end>=0.5-epsilon)){
   groups.push(group);group=[];end=-Infinity;pending=false;
  }
  group.push(...onset);
  for(const n of onset)end=Math.max(end,n.start+n.duration);
  lastStart=start;
 }
 if(group.length)groups.push(group);
 return groups;
}
/** Soft, reviewable sounding-MIDI register preferences, not hard range limits.
 * Piano and unspecified vocal types deliberately have no narrower preference. */
export const REGISTER_TESSITURA:Partial<Record<InstrumentFamily,readonly [number,number]>>={
 Contrabass:[31,48],Violin:[60,84],Bandoneon:[53,79],Guitar:[45,76],
 Clarinet:[55,82],Flute:[65,89],Trumpet:[58,77],Trombone:[45,69]
};
/** Representative boundary pitches: median of simultaneous notes, using slide endpoints
 * where present. This avoids treating arbitrary chord ordering as a melodic voice. */
function registerBoundaryPitch(group:Note[],exit:boolean):number{
 const time=(n:Note)=>exit?n.start+n.duration:n.start;
 const edge=group.reduce((v,n)=>exit?Math.max(v,time(n)):Math.min(v,time(n)),exit?-Infinity:Infinity);
 const pitches=group.filter(n=>Math.abs(time(n)-edge)<1e-6)
  .map(n=>exit?n.slideTo??n.pitch:n.approachSlideFrom??n.pitch).sort((a,b)=>a-b);
 const middle=Math.floor(pitches.length/2);
 return pitches.length%2?pitches[middle]:(pitches[middle-1]+pitches[middle])/2;
}
/** Range first; then avoid newly enlarged leaps and reversals of melodic direction.
 * Preserve register continuity before soft tessitura and displacement preferences. */
export function optimizePhraseOctaves(groups:Note[][],semitones:number,low:number,high:number,tessitura?:readonly [number,number],ensembleCost?:(group:Note[],offset:number)=>number,playable?:(pitch:number)=>boolean):number[]{
 const options=[0,12,-12,24,-24];
 type Cost=[number,number,number,number,number,number];
 type State={cost:Cost;previous:number};
 const less=(a:Cost,b:Cost)=>{for(let i=0;i<a.length;i++){if(a[i]!==b[i])return a[i]<b[i];}return false;};
 const rows:State[][]=[];
 const entries=groups.map(g=>g.length?registerBoundaryPitch(g,false):0);
 const exits=groups.map(g=>g.length?registerBoundaryPitch(g,true):0);
 for(let i=0;i<groups.length;i++){
  const group=groups[i];
  const row=options.map((offset):State=>{
   const violations=group.filter(n=>!noteFits(n,semitones+offset,low,high,playable)).length;
   const displacement=Math.abs(offset)/12*group.length;
   const comfort=tessitura?group.reduce((sum,n)=>{
    const pitch=n.pitch+semitones+offset;
    return sum+Math.max(0,tessitura[0]-pitch,pitch-tessitura[1])*Math.max(0,n.duration);
   },0):0;
   const ensemble=ensembleCost?.(group,offset)??0;
   if(i===0)return {cost:[violations,0,ensemble,0,comfort,displacement],previous:-1};
   let best:State|undefined;
   for(let j=0;j<options.length;j++){
    const prior=rows[i-1][j].cost;
    const original=entries[i]-exits[i-1],adapted=original+offset-options[j];
    const melodic=group.length&&groups[i-1].length?
     Math.max(0,Math.abs(adapted)-Math.max(5,Math.abs(original)))+
     (original*adapted<0?Math.min(Math.abs(original),Math.abs(adapted)):0):0;
    const cost:Cost=[prior[0]+violations,prior[1]+melodic,prior[2]+ensemble,prior[3]+Math.abs(offset-options[j])/12,prior[4]+comfort,prior[5]+displacement];
    if(!best||less(cost,best.cost))best={cost,previous:j};
   }
   return best!;
  });
  rows.push(row);
 }
 if(!rows.length)return [];
 let index=0;
 const last=rows[rows.length-1];
 for(let j=1;j<options.length;j++)if(less(last[j].cost,last[index].cost))index=j;
 const result:number[]=Array(rows.length);
 for(let i=rows.length-1;i>=0;i--){result[i]=options[index];index=rows[i][index].previous;}
 return result;
}
/** Penalize new crossings and unisons between overlapping notes. */
export function ensembleRegisterCost(a:Note,aOffset:number,b:Note,bOffset:number):number{
 const overlap=Math.min(a.start+a.duration,b.start+b.duration)-Math.max(a.start,b.start);
 if(overlap<=1e-6)return 0;
 const original=a.pitch-b.pitch,adapted=original+aOffset-bOffset;
 if(original===0)return 0;
 return overlap*(original*adapted<0?2:adapted===0?1:0);
}
export function planRegisterTransposition(score:Score,p:Project,semitones:number,parts:Record<string,RegisterPartSetting>={},chordToneRhythm=false):{corrections:TransposeCorrection[];decisions:RegisterDecision[]}{
 const corrections:TransposeCorrection[]=[],decisions:RegisterDecision[]=[];
 const entries=Object.entries(score);
 const ensembleOffsets=new Map<Note,number>();
 const flexible:{name:string;groups:Note[][];low:number;high:number;playable?:(pitch:number)=>boolean}[]=[];
 const playableFor=(inst:Instrument)=>instrumentFamily(inst)==='Bandoneon'?(pitch:number)=>instrumentPitchPlayable(inst,pitch,p):undefined;
 for(const [name,notes] of entries){
  const [low,high]=instrumentRange(name,p),playable=playableFor(name),requested=parts[name]?.strategy??'auto';
  const uniform=bestOctave(notes,semitones,low,high,playable);
  if(requested==='whole'||(requested==='auto'&&uniform!==null)){
   for(const n of notes)ensembleOffsets.set(n,requested==='whole'?parts[name]?.octaves??0:uniform??0);
  }else if(requested==='phrase'||requested==='auto'){
   const groups=phraseGroups(notes,p),shifts=optimizePhraseOctaves(groups,semitones,low,high,REGISTER_TESSITURA[instrumentFamily(name)],undefined,playable);
   groups.forEach((group,i)=>group.forEach(n=>ensembleOffsets.set(n,shifts[i])));
   flexible.push({name,groups,low,high,playable});
  }
 }
 // Coordinate flexible parts against the seeded ensemble; explicit strategies stay fixed.
 for(const {name,groups,low,high,playable} of flexible.sort((a,b)=>a.name.localeCompare(b.name))){
  const others=entries.filter(([other])=>other!==name).flatMap(([,ns])=>ns).sort((a,b)=>a.start-b.start);
  const overlaps=new Map<Note,Note[]>();
  for(const n of groups.flat()){
   const matching:Note[]=[];
   for(const b of others){if(b.start>=n.start+n.duration)break;if(b.start+b.duration>n.start)matching.push(b);}
   overlaps.set(n,matching);
  }
  const shifts=optimizePhraseOctaves(groups,semitones,low,high,REGISTER_TESSITURA[instrumentFamily(name)],
   (group,offset)=>group.reduce((sum,n)=>sum+(overlaps.get(n)??[]).reduce((cost,b)=>cost+ensembleRegisterCost(n,offset,b,ensembleOffsets.get(b)??0),0),0),playable);
  groups.forEach((group,i)=>group.forEach(n=>ensembleOffsets.set(n,shifts[i])));
 }
 for(const [name,notes] of entries){
  const inst=name as Instrument,[low,high]=instrumentRange(inst,p),playable=playableFor(inst);
  const requested=parts[inst]?.strategy??'auto';
  const originalOut=notes.filter(n=>!noteFits(n,semitones,low,high,playable)).length;
  const uniform=bestOctave(notes,semitones,low,high,playable);
  let strategy:RegisterStrategy=requested;
  if(strategy==='auto')strategy=uniform!==null?'whole':'phrase';
  const chosen=parts[inst]?.octaves??0;
  const wholeOffset=strategy==='whole'?(requested==='whole'?chosen:uniform??0):0;
  const groups=strategy==='phrase'?phraseGroups(notes,p):[notes];
  const offsets=new Map<Note,number>();
  if(strategy==='whole'){for(const n of notes)offsets.set(n,wholeOffset);}
  else if(strategy==='phrase'){
   for(const group of groups)for(const n of group)offsets.set(n,ensembleOffsets.get(n)??0);
  }
  let unresolved=0;
  for(const n of notes){
   const intended=n.pitch+semitones,measure=Math.max(0,Math.min(p.bars.length-1,Math.floor(n.start/p.beats)));
   let offset=offsets.get(n)??0,kind:TransposeCorrection['strategy']=strategy==='whole'?'whole':strategy==='phrase'?'phrase':'octave';
   if(strategy==='exact')continue;
   if(!noteFits(n,semitones+offset,low,high,playable)){
    if(strategy==='whole'){kind='unresolved';unresolved++;}
    else{
     const role=p.measureRoles?.[`${inst}:${measure}`]??p.roles?.[p.bars[measure]?.section]?.[inst];
     const chord=chordAtNote(p,n);
     const tones=chordToneRhythm&&['chords','harmony','fill'].includes(role??'')&&chord?chordTones(chord).map(pc=>(pc+semitones+120)%12):undefined;
     const suggestion=nearestPlayablePitch(intended,low,high,tones,playable);
     offset=suggestion.pitch-intended;kind=suggestion.strategy;
     if(!noteFits(n,semitones+offset,low,high,playable)){kind='unresolved';unresolved++;}
    }
   }
   if(offset!==0||kind==='unresolved')corrections.push({instrument:inst,measure,start:n.start,originalPitch:n.pitch,intendedPitch:intended,suggestedPitch:kind==='unresolved'?intended:intended+offset,strategy:kind});
  }
  decisions.push({instrument:inst,strategy,octaves:wholeOffset,outOfRange:originalOut,unresolved});
 }
 return {corrections,decisions};
}
export function planAdaptiveTransposition(score:Score,p:Project,semitones:number,chordToneRhythm=false):TransposeCorrection[]{
 return planRegisterTransposition(score,p,semitones,{},chordToneRhythm).corrections;
}
/** Adapt the derived score only. The global transpose is applied separately by playback/export. */
export function adaptTransposedScore(score:Score,project:Project):Score{
 const settings=project.adaptiveTranspose;
 if(!settings?.enabled||settings.semitones!==(project.transposeSemitones??0))return score;
 const {corrections}=planRegisterTransposition(score,project,settings.semitones,settings.parts,settings.chordToneRhythm);
 const lookup=new Map(corrections.map(c=>[`${c.instrument}:${c.start}:${c.originalPitch}`,c]));
 return Object.fromEntries(Object.entries(score).map(([inst,notes])=>[inst,notes.map(n=>{
  const c=lookup.get(`${inst}:${n.start}:${n.pitch}`);
  if(!c||c.strategy==='unresolved')return n;
  const delta=c.suggestedPitch-c.intendedPitch;
  return {...n,pitch:n.pitch+delta,slideTo:n.slideTo===undefined?undefined:n.slideTo+delta,approachSlideFrom:n.approachSlideFrom===undefined?undefined:n.approachSlideFrom+delta,
   gesture:n.gesture?transposeTangoGesture(n.gesture,delta):undefined};
 })])) as Score;
}
export const defaultArticulation=()=>({phraseBars:8,enabled:true,overrides:{} as Record<string,Exclude<Articulation,'auto'>>});
export function transposeScore(score:Score,semitones:number):Score {
  if(!Number.isInteger(semitones)||semitones < -24||semitones > 24)throw Error('Transpose must be an integer between -24 and +24 semitones');
  return Object.fromEntries(Object.keys(score).map(i=>[i,(score[i]??[]).map(n=>{const pitch=n.pitch+semitones;if(pitch<0||pitch>127||(n.stringGlissando&&(pitch+n.stringGlissando.interval<0||pitch+n.stringGlissando.interval>127))||(n.slideTo!==undefined&&(n.slideTo+semitones<0||n.slideTo+semitones>127))||(n.approachSlideFrom!==undefined&&(n.approachSlideFrom+semitones<0||n.approachSlideFrom+semitones>127)))throw Error(`Transposition exceeds MIDI pitch limits for ${i}`);return {...n,pitch,slideTo:n.slideTo===undefined?undefined:n.slideTo+semitones,approachSlideFrom:n.approachSlideFrom===undefined?undefined:n.approachSlideFrom+semitones,gesture:n.gesture?transposeTangoGesture(n.gesture,semitones):undefined};})])) as Score;
}
export function transposeChord(symbol:string,semitones:number):string {
  if(!Number.isInteger(semitones)||semitones < -24||semitones > 24)throw Error('Invalid transpose');
  return symbol.replace(/(^|\/)([A-G])([#b]?)/g,(_m,prefix,step,acc)=>{const n=parsePitch(step+acc+'4');return n===null?_m:prefix+PITCHES[((n+semitones)%12+12)%12];});
}
/** Key changes are separate from global transposition. The caller chooses whether
 * to move harmony, lead melody, or just the printed key signature.
 * Qualities (m, 7, dim, etc.) and inversions are preserved; this does NOT
 * reharmonize a major passage into minor or vice versa.
 */
export type SectionKeyChangeMode='signature'|'chords'|'chords-and-melody';
/** Display harmony in the sounding key, without modifying the source chord.
 * Preserve explicit source spelling when no transposition is applied, except
 * where the key's accidental preference supplies a better enharmonic name. */
export function soundingChord(symbol:string,key:string,semitones=0):string{
 if(!symbol.trim()||symbol==='—'||symbol==='–')return symbol;
 const target=transposeKeySignature(key,semitones);
 const {fifths}=parseKeySignature(target);
 const tonic=target.replace(/m$/,'');
 // Neutral keys use their conventional diatonic names; F and flat keys
 // prefer flats, while sharp keys prefer sharps.
 const names=fifths<0||tonic==='F'?['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B']:['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'];
 const sharp=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
 return symbol.replace(/(^|\/)([A-Ga-g])([#b]?)/g,(match,prefix,step,acc)=>{
  const pitch=parsePitch(step.toUpperCase()+acc+'4');
  if(pitch===null)return match;
  const pc=((pitch+semitones)%12+12)%12;
  return prefix+(fifths>0?sharp:names)[pc];
 });
}
/** Current and immediately upcoming harmony, with the current bar's changes
 * taking precedence over the following bar's first chord (even if repeated). */
export function stageHarmonyAt(p:Project,bar:number,localBeat:number){
 const changes=(index:number)=>{
  const measure=p.bars[index];if(!measure)return [];
  return parseChordSequence(measure.chord,p.beats).map(c=>({...c,chord:soundingChord(c.chord,sectionKey(p,measure.section),p.transposeSemitones??0)}));
 };
 const now=changes(bar),current=now.filter(c=>c.beat<=localBeat+1e-7).at(-1)?.chord??'—';
 const within=now.find(c=>c.beat>localBeat+1e-7&&c.chord!==current);
 const next=within??changes(bar+1)[0];
 return {current,next:next?.chord??'—',sameBar:!!within,nextMeasure:next?(within?bar+1:bar+2):null,nextBeat:next?next.beat+1:null};
}
export function sectionKeyInterval(fromKey:string,toKey:string):number {
  parseKeySignature(fromKey);parseKeySignature(toKey);
  const from=parsePitch(fromKey.replace(/m$/,'')+'4')!;
  const to=parsePitch(toKey.replace(/m$/,'')+'4')!;
  const up=((to-from)%12+12)%12;
  return up>6?up-12:up;
}
export function transposeChordForKey(chord:string,semitones:number,toKey:string):string {
  parseKeySignature(toKey);
  if(!Number.isInteger(semitones)||Math.abs(semitones)>24)throw Error('Invalid key interval');
  const spell= parseKeySignature(toKey).fifths<0?FLAT_PITCHES:SHARP_PITCHES;
  const pitch=(root:string)=>{
    // Use the parser directly for root case; don't change a valid accidental.
    const parsed=parsePitch(root[0].toUpperCase()+root.slice(1)+'4');
    if(parsed===null)throw Error('Invalid chord root: '+root);
    return spell[((parsed+semitones)%12+12)%12];
  };
  const match=chord.match(/^([A-Ga-g][#b]?)(.*)$/);
  if(!match)throw Error('Invalid chord: '+chord);
  const slash=match[2].match(/^(.*)\/([A-Ga-g][#b]?)$/);
  return pitch(match[1])+(slash?slash[1]+'/'+pitch(slash[2]):match[2]);
}
export function changeSectionKey(p:Project,section:string,toKey:string,mode:SectionKeyChangeMode,adaptProtected=false):Project {
  if(!p.bars.some(bar=>bar.section===section))throw Error('Unknown section: '+section);
  if(!['signature','chords','chords-and-melody'].includes(mode))throw Error('Invalid section key change mode');
  parseKeySignature(toKey);
  const oldKey=sectionKey(p,section),delta=sectionKeyInterval(oldKey,toKey);
  const next:Project={...p,sectionKeys:{...p.sectionKeys,[section]:toKey}};
  if(mode==='signature')return next;
  next.bars=p.bars.map(bar=>bar.section!==section?bar:{...bar,
    chord:bar.chord.split(',').map(c=>c.trim()?transposeChordForKey(c.trim(),delta,toKey):'').join(','),
    melody:mode==='chords-and-melody'?bar.melody.map(n=>{
      const pitch=n.pitch+delta;
      if(pitch<0||pitch>127)throw Error('Section melody transposition exceeds MIDI pitch range');
      return {...n,pitch};
    }):bar.melody.map(n=>({...n}))
  });
  // Protected instrument notes are the musician's edits. Keep them unchanged
  // for harmony-only changes, or transpose them with the lead melody.
  if(mode==='chords-and-melody'&&p.importedScore){
    const transposeProtected=(inst:Instrument,n:Note):Note=>{
      const measure=Math.floor((n.start+1e-7)/p.beats);
      if(p.bars[measure]?.section!==section||!p.protectedBars[`${inst}:${measure}`])return {...n};
      const [lo,hi]=writtenInstrumentRange(inst,p),intended=n.pitch+delta;
      const playable=(pitch:number)=>writtenInstrumentPitchPlayable(inst,pitch,p);
      const proposed=adaptProtected?nearestPlayablePitch(intended,lo,hi,undefined,playable):{pitch:intended,strategy:'unresolved' as const};
      const correction=proposed.pitch-intended;
      const pitch=intended+correction;
      const slideTo=n.slideTo===undefined?undefined:n.slideTo+delta+correction;
      const approachSlideFrom=n.approachSlideFrom===undefined?undefined:n.approachSlideFrom+delta+correction;
      if(!playable(pitch)||(slideTo!==undefined&&!playable(slideTo))||(approachSlideFrom!==undefined&&!playable(approachSlideFrom)))
        throw Error(`Protected ${inst} note exceeds playable register; section key unchanged`);
      return {...n,pitch,slideTo,approachSlideFrom};
    };
    next.importedScore=Object.fromEntries(projectInstruments(p).map(inst=>[inst,(p.importedScore?.[inst]??[]).map(n=>transposeProtected(inst,n))])) as Score;
  }
  // Rebuild non-protected measures from the new harmony and lead sheet.
  // Protected measures are merged from importedScore (transposed above when requested).
  if(p.generatedScore||p.importedScore){next.generatedScore=mergeScores(next,generate(next));}
  return next;
}

export function measureArticulation(p:Project,inst:Instrument,barIndex:number,phrase?:Phrase|null):Exclude<Articulation,'auto'>|undefined {
  const planned=plannedArticulation(p,inst,barIndex,phrase);
  if(!(inst.startsWith('Violin')||inst.startsWith('Bandoneon'))&&!planned)return undefined;
  const override=p.articulation?.overrides?.[`${inst}:${barIndex}`];if(override)return override;
  if(planned)return planned;
  if(p.articulation?.enabled===false)return undefined;
  const period=Math.max(1,Math.min(32,p.articulation?.phraseBars??8));
  // Phrase variation: stagger switches between instrument groups without random rests.
  const variation=inst==='Violin II'?2:inst==='Bandoneon II'?1:0;
  const rhythmic=Math.floor((barIndex+variation)/period)%2===0;
  return rhythmic?'marcato_staccato':'legato';
}
export const PITCHES = ['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'];
export const midiName = (n:number) => PITCHES[((n%12)+12)%12]+(Math.floor(n/12)-1);
/** Enharmonic labels for the editor. These are display spellings of the same
 * MIDI pitch; section-key spelling remains authoritative for MusicXML. */
const SHARP_PITCHES=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const FLAT_PITCHES=['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
export function editorPitchName(n:number,accidentals:'sharp'|'flat'='sharp'):string {
  if(!Number.isInteger(n)||n<0||n>127)throw Error('Invalid MIDI pitch');
  return (accidentals==='flat'?FLAT_PITCHES:SHARP_PITCHES)[n%12]+(Math.floor(n/12)-1);
}
export function parsePitch(s:string):number|null { const m=s.trim().match(/^([A-Ga-g])([#b]?)(-?\d+)$/);if(!m)return null;const pc:Record<string,number>={C:0,D:2,E:4,F:5,G:7,A:9,B:11};return (Number(m[3])+1)*12+pc[m[1].toUpperCase()]+(m[2]==='#'?1:m[2]==='b'?-1:0); }
/** A comma-delimited chord sequence divides the bar into beat-aligned slots.
 * 4/4: D,G => D on beats 1-2 and G on 3-4;
 * D,D,D,G => G begins on beat 4. Repetitions are meaningful.
 * For three entries in 4/4, starts are beats 1, 2 and 3.
 */
export type ChordChange = {beat:number; chord:string};
export function parseChordSequence(input:string,beats:number):ChordChange[] {
  if(!Number.isInteger(beats)||beats<1||beats>12)throw Error('Invalid time signature');
  if(!input.trim())return [];
  const parts=input.split(',').map(x=>x.trim());
  if(parts.length>beats)throw Error(`At most ${beats} chord slots in ${beats}/4; one slot per beat`);
  if(parts.some(x=>!/^([A-Ga-g])([#b]?)([a-zA-Z0-9+#°øΔ()\/\-]*)$/.test(x)))
    throw Error('Invalid chord sequence: use symbols such as Dm, G7, F#dim, or D,G');
  return parts.map((chord,i)=>({beat:Math.floor(i*beats/parts.length),chord:chord[0].toUpperCase()+chord.slice(1)}));
}
/** Common chord qualities. The list is intentionally conservative: these symbols
 * are accepted by the harmony parser and the pitch-class generator. */
export const CHORD_QUALITIES = ['', 'm', '7', 'maj7', 'm7', 'dim', 'dim7', 'm7b5', 'aug', '6', 'm6', '9', 'sus4', '7b9'] as const;
/** Locate only the comma-separated chord containing the caret. */
export function chordTokenRange(input:string,caret:number):{start:number;end:number;token:string} {
  const pos=Math.max(0,Math.min(input.length,Math.floor(Number.isFinite(caret)?caret:input.length)));
  const before=input.lastIndexOf(',',Math.max(0,pos-1));
  const after=input.indexOf(',',pos);
  const start=before+1,end=after<0?input.length:after;
  return {start,end,token:input.slice(start,end).trim()};
}
/** Autocomplete only the chord under the caret, preserving earlier/later slots. */
export function chordCompletions(input:string,caret:number,max=10):string[] {
  const {token}=chordTokenRange(input,caret);
  const match=token.match(/^([A-Ga-g])([#b]?)(.*)$/);
  if(!match)return [];
  const root=match[1].toUpperCase()+match[2];
  const typed=root+match[3];
  const candidates=CHORD_QUALITIES.map(quality=>root+quality);
  return candidates.filter(candidate=>candidate.toLowerCase().startsWith(typed.toLowerCase())).slice(0,Math.max(0,max));
}
export function completeChordToken(input:string,caret:number,suggestion:string):{value:string;caret:number} {
  // Completion cannot inject commas or other invalid characters into a slot.
  if(!/^([A-G])([#b]?)([a-zA-Z0-9+#°øΔ()\/\-]*)$/.test(suggestion))throw Error('Invalid chord completion');
  const {start,end}=chordTokenRange(input,caret);
  const value=input.slice(0,start)+suggestion+input.slice(end);
  return {value,caret:start+suggestion.length};
}
export function chordAt(input:string,beats:number,beat:number):string {
  const changes=parseChordSequence(input,beats);
  return [...changes].reverse().find(c=>c.beat<=beat+1e-8)?.chord??changes[0]?.chord??'';
}
export function chordSequenceFromBeats(changes:ChordChange[],beats:number):string {
  if(!changes.length)return 'Dm';
  const sorted=[...changes].sort((a,b)=>a.beat-b.beat);
  const first=sorted[0].chord;
  const slots=Array.from({length:beats},(_,beat)=>{
    let chord=first;
    for(const change of sorted)if(change.beat<=beat+1e-8)chord=change.chord;
    return chord;
  });
  // Prefer the compact half-bar form when its onset times are identical.
  if(beats%2===0 && slots.slice(0,beats/2).every(x=>x===slots[0]) && slots.slice(beats/2).every(x=>x===slots[beats/2]))
    return slots[0]===slots[beats/2]?slots[0]:`${slots[0]},${slots[beats/2]}`;
  return slots.every(x=>x===slots[0])?slots[0]:slots.join(',');
}
export function chordTones(symbol:string):number[] {const m=symbol.trim().match(/^([A-Ga-g])([#b]?)(.*)$/);if(!m)return [0,4,7];const root=parsePitch(m[1].toUpperCase()+m[2]+'4')!%12;const q=m[3].toLowerCase();const minor=/^(m(?!aj)|min|-)/.test(q);const halfDim=/m7b5|ø/.test(q);const dim=/dim|°|o7/.test(q);const aug=/aug|\+/.test(q);const seventh=/7|9|11|13/.test(q);const maj7=/maj7|ma7|Δ/i.test(m[3]);const intervals=dim||halfDim?[0,3,6]:aug?[0,4,8]:minor?[0,3,7]:[0,4,7];if(seventh)intervals.push(dim?9:maj7?11:10);return intervals.map(n=>(root+n)%12);}
export function closest(pc:number,target:number,lo:number,hi:number):number {const options=[];for(let n=lo;n<=hi;n++)if(n%12===pc)options.push(n);return options.sort((a,b)=>Math.abs(a-target)-Math.abs(b-target))[0]??target;}
export function defaultRoles():Project['roles'] {const sets:Record<string,Role[]>={A1:['chords','bass','melody','chords','chords','harmony','rest'],B1:['chords','bass','harmony','chords','melody','harmony','rest'],A2:['chords','bass','chords','melody','chords','harmony','rest'],B2:['chords','bass','melody','harmony','fill','chords','rest'],C:['chords','bass','harmony','chords','variation','harmony','rest']};return Object.fromEntries(Object.entries(sets).map(([s,roles])=>[s,Object.fromEntries(INSTRUMENTS.map((inst,i)=>[inst,roles[i]]))]));}
/** Create an empty, editable score. No placeholder melody or fabricated harmony. */
export function blankProject(options:{title?:string;measures?:number;sections?:number;measuresPerSection?:number|number[];beats?:number;bpm?:number}={}):Project {
  const beats=options.beats??4,bpm=options.bpm??124;
  if(!Number.isInteger(beats)||beats<2||beats>4)throw Error('Choose 2/4, 3/4 or 4/4');
  if(!Number.isFinite(bpm)||bpm<40||bpm>240)throw Error('Tempo must be 40–240 BPM');
  const sections=options.sections??(Array.isArray(options.measuresPerSection)?options.measuresPerSection.length:options.measures!==undefined?Math.min(5,Math.ceil(options.measures/16)):5);
  if(!Number.isInteger(sections)||sections<1||sections>26)throw Error('Choose 1–26 sections');
  const lengths:number[]=Array.isArray(options.measuresPerSection)?options.measuresPerSection:
    options.measures!==undefined?Array.from({length:sections},(_,i)=>Math.floor(options.measures!/sections)+(i<options.measures!%sections?1:0)):
    Array.from({length:sections},()=>typeof options.measuresPerSection==='number'?options.measuresPerSection:16);
  if(lengths.length!==sections||lengths.some(n=>!Number.isInteger(n)||n<1||n>128)||lengths.reduce((a,b)=>a+b,0)>512)
    throw Error('Blank song needs 1–128 measures per section and at most 512 measures');
  const labels=lengths.map((_,i)=>sectionLetter(i));
  const defaults=defaultRoles();const roles:Project['roles']={};
  labels.forEach((label,i)=>{roles[label]={...(defaults[['A1','B1','A2','B2','C'][i%5]]??{})};});
  const base=defaultOrchestration();const orchestration=defaultOrchestration();
  orchestration.violin={};orchestration.bandoneon={};orchestration.contrabass={};
  labels.forEach((label,i)=>{const old=['A1','B1','A2','B2','C'][i%5];orchestration.violin[label]={...(base.violin[old]??{})};orchestration.contrabass![label]=base.contrabass?.[old]??'traditional';orchestration.bandoneon[label]={...(base.bandoneon[old]??{})};});
  const expression=defaultExpression();expression.sections=Object.fromEntries(labels.map((label,i)=>[label,['mp','mf','mp','f','f'][i%5] as DynamicMark]));
  return {
    version:1,title:options.title?.trim()||'Untitled Tango',bpm,beats,profile:'traditional',
    sectionKeys:Object.fromEntries(labels.map(label=>[label,'C'])),
    bars:lengths.flatMap((length,i)=>Array.from({length},()=>({chord:'',melody:[] as Note[],section:labels[i]}))),
    roles,protectedBars:{},transposeSemitones:0,articulation:defaultArticulation(),
    orchestration,difficulty:'advanced',instrumentSettings:defaultInstrumentSettings(),expression
  };
}
export function demoProject():Project {const chords=['Dm','Dm','Gm','A7','Dm','Gm','A7','Dm','F','C7','F','A7','Dm','Gm','A7','Dm','Dm','Dm','Gm','A7','Dm','Gm','A7','Dm','F','C7','F','A7','Dm','Gm','A7','Dm','Dm','Gm','A7','Dm','Dm','Gm','A7','Dm'];const pattern=[[74,1],[77,1],[76,1],[74,1]];return {version:1,title:'Untitled Tango (demo melody)',bpm:124,beats:4,profile:'traditional',sectionKeys:{A1:'Dm',B1:'F',A2:'Dm',B2:'F',C:'Dm'},bars:chords.map((chord,i)=>({chord,section:i<8?'A1':i<16?'B1':i<24?'A2':i<32?'B2':'C',melody:pattern.map(([pitch,duration],j)=>({pitch:pitch+(i%8===4?-2:0)+(i%16>=8?3:0),start:j,duration}))})),roles:defaultRoles(),protectedBars:{},transposeSemitones:0,articulation:defaultArticulation(),orchestration:defaultOrchestration(),difficulty:'advanced',instrumentSettings:defaultInstrumentSettings(),expression:defaultExpression()};}
/** Beat positions (zero-based) for violin chord-accompaniment marcato.
 * Profile defaults are arranging heuristics, not claims about fixed composer rules.
 * A section override can specify any subset, including none, for each violin. */
export const VIOLIN_PROFILE_MARCATO:Readonly<Record<string,readonly number[]>>={
  traditional:[0,2],darienzo:[0,2],disarli:[0],troilo:[1,3],
  fresedo:[0],canaro:[0,2],pugliese:[0,3]
};
export function violinMarcatoBeatsFor(p:Project,section:string,inst:ViolinPart):number[]{
  const chosen=p.violinMarcatoBeats?.[section]?.[inst];
  const defaults=VIOLIN_PROFILE_MARCATO[p.profile]??VIOLIN_PROFILE_MARCATO.traditional;
  return [...new Set((chosen??defaults).filter(n=>Number.isInteger(n)&&n>=0&&n<p.beats))].sort((a,b)=>a-b);
}
/** Tango chord violin: one note on each beat, with an exceptionally short
 * sounding gate on unaccented beats; a longer/louder marcato on chosen beats.
 * Written rhythm stays at a quarter note for proper notation. */
export function violinChordNoteStyle(p:Project,section:string,inst:ViolinPart,beat:number,technique:ViolinTechnique):Pick<Note,'articulation'|'gate'|'accent'|'technique'>{
  const marcato=violinMarcatoBeatsFor(p,section,inst).includes(Math.floor(beat));
  return {articulation:marcato?'marcato_staccato':'staccato',
    gate:marcato?0.58:technique==='pizzicato'?0.22:0.16,
    accent:marcato,technique:technique==='pizzicato'?'pizzicato':'arco'};
}
export const patterns:Record<string,{density:number;accent:number;legato:number;strongBeats:boolean;yumba:boolean;strings:boolean}>={traditional:{density:1,accent:0.8,legato:0,strongBeats:true,yumba:false,strings:true},darienzo:{density:1,accent:1,legato:0,strongBeats:false,yumba:false,strings:false},disarli:{density:1,accent:0.75,legato:0.22,strongBeats:true,yumba:false,strings:true},troilo:{density:1,accent:0.78,legato:0.24,strongBeats:true,yumba:false,strings:true},fresedo:{density:0.9,accent:0.65,legato:0.25,strongBeats:true,yumba:false,strings:true},canaro:{density:1,accent:0.8,legato:0.1,strongBeats:false,yumba:false,strings:false},pugliese:{density:1,accent:1,legato:0.15,strongBeats:true,yumba:true,strings:true}};
// Conservative violin string model: open strings G3 D4 A4 E5, positions 0..7 semitones.
// A double stop is permitted only if each note is reachable on adjacent strings.
const VIOLIN_OPEN=[55,62,69,76];
export function playableDoubleStop(tones:number[],target=70):[number,number]|null {
  const pcs=new Set(tones.map(n=>(n%12+12)%12));
  const candidates:{pair:[number,number];cost:number}[]=[];
  for(let string=0;string<3;string++)for(let a=0;a<=7;a++)for(let b=0;b<=7;b++){
    const lo=VIOLIN_OPEN[string]+a,hi=VIOLIN_OPEN[string+1]+b;
    if(pcs.has(lo%12)&&pcs.has(hi%12)) candidates.push({pair:[lo,hi],cost:Math.abs((lo+hi)/2-target)+a+b+(a&&b?2:0)});
  }
  return candidates.sort((a,b)=>a.cost-b.cost)[0]?.pair??null;
}
/** Piano staff assignment is an editable register split, not a second instrument.
 * MIDI 60 (middle C) and above default to treble; below to bass. */
/** Exactly four single-note arpeggio events across one measure, regardless of
 * meter or instrument difficulty. Triads repeat the root at the octave; seventh
 * chords use four distinct chord tones. Mid-measure harmony is read at EACH
 * event, not once at the start. Choose the nearest playable monotonic voicing.
 * The direction is measured across the whole bar, never restarted per beat.
 */
export function violinArpeggioMeasure(p:Project,inst:ViolinPart,barIndex:number):{pitch:number;start:number;duration:number}[] {
  const bar=p.bars[barIndex];
  if(!bar)throw Error('Invalid arpeggio measure');
  if(!bar.chord.trim())return [];
  const preference=p.violinArpeggioDirections?.[bar.section]?.[inst]??'alternate';
  if(!['up','down','alternate'].includes(preference))throw Error('Invalid arpeggio direction');
  const sectionStart=p.bars.findIndex(b=>b.section===bar.section);
  const up=preference==='up'||(preference==='alternate'&&(barIndex-sectionStart)%2===0);
  const duration=p.beats/4;
  const pcs=Array.from({length:4},(_,j)=>{
    const tones=chordTones(chordAt(bar.chord,p.beats,j*duration));
    const index=up?j:3-j;
    return tones[index%tones.length];
  });
  const [lo,hi]=instrumentRange(inst),center=inst==='Violin I'?76:69;
  const candidates:{pitches:number[];cost:number}[]=[];
  for(let first=lo;first<=hi;first++){
    if(first%12!==pcs[0])continue;
    const pitches=[first];
    for(let j=1;j<4;j++){
      const prev=pitches[j-1];
      let next=up?prev+1:prev-1;
      if(up)while(next%12!==pcs[j]&&next<=hi)next++;
      else while(((next%12)+12)%12!==pcs[j]&&next>=lo)next--;
      if(next<lo||next>hi)break;
      pitches.push(next);
    }
    if(pitches.length===4){
      const middle=(pitches[0]+pitches[3])/2;
      candidates.push({pitches,cost:Math.abs(middle-center)+0.08*Math.abs(pitches[3]-pitches[0])});
    }
  }
  const best=candidates.sort((a,b)=>a.cost-b.cost)[0];
  if(!best)throw Error(`No playable arpeggio for ${inst}, measure ${barIndex+1}`);
  return best.pitches.map((pitch,j)=>({pitch,start:j*duration,duration}));
}
export function pianoStaffForPitch(pitch:number,splitPitch=60):1|2 {
  if(!Number.isFinite(pitch)||!Number.isInteger(splitPitch)||splitPitch<48||splitPitch>72)throw Error('Invalid piano staff split');
  return pitch>=splitPitch?1:2;
}

export function partUsesGrandStaff(project:Project,inst:Instrument,notes:readonly Note[]):boolean {
  return inst.startsWith('Piano')||
    (inst.startsWith('Bandoneon')&&(Boolean(project.bandoneonGrandStaff?.[inst])||notes.some(note=>note.xmlStaff===2)));
}

/** Staff placement is a practice aid. It does not prescribe physical fingering. */
export function partStaffForNote(note:Note,inst:Instrument,splitPitch=60,transpose=0,bandoneonModel?:BandoneonModelId):1|2 {
  if(note.staffOverride===1||note.staffOverride===2)return note.staffOverride;
  if(inst.startsWith('Bandoneon')){
    if(note.xmlStaff===1||note.xmlStaff===2)return note.xmlStaff;
    const hand=bandoneonHandForPitch(note.pitch,bandoneonModel);
    if(hand)return hand==='right'?1:2;
  }
  return pianoStaffForPitch(note.pitch-transpose,splitPitch);
}

/** The piano accompanies, rather than replaces, the double bass.
 * Select the same root/fifth pitch class as the contrabass part but normally
 * an octave higher, in a comfortable left-hand F-clef register. A0-C8 remains
 * available to the editor; automated tango compás should not use its extremes.
 * MIDI 28-55 reflects the current generated contrabass's played register.
 */
export function pianoBassReinforcement(pc:number,contrabassReference:number,pianoLow=21,pianoHigh=55):number{
 const floor=Math.max(36,pianoLow),ceiling=Math.min(55,pianoHigh);
 if(ceiling<floor)throw Error('No playable piano bass register');
 const bass=closest(pc,contrabassReference,28,55);
 const octaveTarget=bass+12;
 return closest(pc,octaveTarget,floor,ceiling);
}
/** Conservative piano heuristics, not a substitute for individual hand sizing or fingering. */
export function pianoHandLimits(difficulty:Difficulty='advanced'){
 return {rightSpan:difficulty==='easy'?7:difficulty==='intermediate'?10:12,rightNotes:difficulty==='easy'?2:3,leftNotes:1};
}
export type PianoPlayabilityIssue={kind:'span'|'polyphony'|'leap';hand:'left'|'right';measure:number;beat:number;message:string};
type PianoVoicingReference={pitches:readonly number[];start:number};
const pianoCenter=(pitches:readonly number[])=>pitches.reduce((sum,pitch)=>sum+pitch,0)/Math.max(1,pitches.length);
const pianoLeapAllowance=(elapsedBeats:number,bpm:number)=>Math.min(24,7+12*Math.max(0,elapsedBeats)*60/Math.max(40,bpm));
function previousPianoChord(notes:readonly Note[],onset:number,split:number):PianoVoicingReference|undefined{
 const history=notes.filter(n=>n.pitch>=split&&n.start<onset-1e-7);
 if(!history.length)return undefined;
 const start=Math.max(...history.map(n=>n.start));
 return {start,pitches:history.filter(n=>Math.abs(n.start-start)<1e-7).map(n=>n.pitch)};
}
/** Jointly choose notes within the hand's span and prefer short movements from the prior chord. */
export function choosePlayablePianoVoicing(tones:readonly number[],target:number,difficulty:Difficulty,lo:number,hi:number,
 previous?:PianoVoicingReference,onset=0,bpm=120):number[]{
 const limits=pianoHandLimits(difficulty);
 const pcs=[...new Set(tones.map(n=>((Math.round(n)%12)+12)%12))].slice(0,limits.rightNotes);
 if(!pcs.length||lo>hi)return [];
 for(let count=pcs.length;count>=1;count--){
  const options=pcs.slice(0,count).map(pc=>{
   const pitches:number[]=[];
   for(let pitch=Math.ceil(lo);pitch<=Math.floor(hi);pitch++)if(((pitch%12)+12)%12===pc)pitches.push(pitch);
   return pitches;
  });
  if(options.some(group=>!group.length))continue;
  let best:number[]|undefined,bestCost=Infinity;
  const explore=(index:number,selected:number[])=>{
   if(index<options.length){
    for(const pitch of options[index])if(!selected.includes(pitch))explore(index+1,[...selected,pitch]);
    return;
   }
   const sorted=[...selected].sort((a,b)=>a-b),span=sorted[sorted.length-1]-sorted[0];
   if(span>limits.rightSpan)return;
   const center=pianoCenter(sorted);
   let cost=Math.abs(center-target)*1.15+span*0.12;
   if(previous?.pitches.length){
    const older=[...previous.pitches].sort((a,b)=>a-b),oldCenter=pianoCenter(older);
    const jump=Math.abs(center-oldCenter),permitted=pianoLeapAllowance(onset-previous.start,bpm);
    cost+=jump*1.8+Math.max(0,jump-permitted)*16;
    for(let i=0;i<Math.min(sorted.length,older.length);i++)cost+=Math.abs(sorted[i]-older[i])*0.4;
   }
   if(cost<bestCost-1e-8){bestCost=cost;best=sorted;}
  };
  explore(0,[]);
  if(best)return best;
 }
 return [];
}
/** Non-destructive score check. Default generation diagnostics retain conservative
 * voicing constraints; human diagnostics use physical capacity and are advisory. */
export function assessPianoPlayability(notes:readonly Note[],p:Pick<Project,'beats'|'bpm'|'pianoSplitPitch'|'difficulty'|'instrumentSettings'>,inst:Instrument='Piano',policy:'generation'|'human'='generation'):PianoPlayabilityIssue[]{
 const split=p.pianoSplitPitch??60,limits=pianoHandLimits(p.instrumentSettings?.[inst]?.difficulty??p.difficulty??'advanced');
 const human=policy==='human';
 const valid=notes.filter(n=>Number.isFinite(n.start)&&Number.isFinite(n.duration)&&n.duration>0);
 const times=[...new Set(valid.map(n=>n.start))].sort((a,b)=>a-b);
 const issues:PianoPlayabilityIssue[]=[];
 let previous:{start:number;pitches:number[]}|undefined;
 const handOf=(n:Note)=>human&&(n.staffOverride===1||n.staffOverride===2||n.xmlStaff===1||n.xmlStaff===2)
  ?((n.staffOverride??n.xmlStaff)===2?'left':'right'):(n.pitch<split?'left':'right');
 for(const time of times){
  const beat=((time%p.beats)+p.beats)%p.beats,measure=Math.floor(time/p.beats);
  // Brief overlaps from legato MIDI/quantization are not reliable evidence of a stretch.
  const tolerance=human?Math.min(.125,.06*p.bpm/60):1e-7;
  const active=valid.filter(n=>n.start<=time+1e-7&&n.start+n.duration>time+(n.start<time-1e-7?tolerance:1e-7));
  const inspect=(hand:'left'|'right',chosen:Note[],maxNotes:number,maxSpan:number)=>{
   const pitches=[...new Set(chosen.map(n=>n.pitch))].sort((a,b)=>a-b);
   if(pitches.length>maxNotes)issues.push({kind:'polyphony',hand,measure,beat,message:`${hand==='left'?'Left':'Right'} hand: ${pitches.length} simultaneous notes (limit ${maxNotes})`});
   if(pitches.length>1&&pitches[pitches.length-1]-pitches[0]>maxSpan)
    issues.push({kind:'span',hand,measure,beat,message:`${hand==='left'?'Left':'Right'} hand: ${pitches[pitches.length-1]-pitches[0]}-semitone span (limit ${maxSpan})`});
  };
  if(human){
   // Allow a two-hand split for unassigned keys, but never move explicitly
   // assigned pitches to another hand just to suppress a reach warning.
   const explicit={left:new Set<number>(),right:new Set<number>()};
   const free=new Set<number>();
   for(const n of active){
    if(n.staffOverride===1||n.staffOverride===2||n.xmlStaff===1||n.xmlStaff===2)explicit[handOf(n)].add(n.pitch);
    else free.add(n.pitch);
   }
   for(const pitch of [...explicit.left,...explicit.right])free.delete(pitch);
   const keys=[...free].sort((a,b)=>a-b);
   const cost=(v:Note[])=>{
    const pitches=[...new Set(v.map(n=>n.pitch))].sort((a,b)=>a-b);
    return Math.max(0,pitches.length-5)*12+Math.max(0,(pitches.at(-1)??0)-(pitches[0]??0)-14);
   };
   let best:{left:Note[];right:Note[];cost:number}|undefined;
   for(let i=0;i<=keys.length;i++){
    const boundary=new Set(keys.slice(0,i));
    const left=active.filter(n=>explicit.left.has(n.pitch)||boundary.has(n.pitch));
    const right=active.filter(n=>explicit.right.has(n.pitch)||(free.has(n.pitch)&&!boundary.has(n.pitch)));
    const penalty=cost(left)+cost(right);
    if(!best||penalty<best.cost)best={left,right,cost:penalty};
    if(!penalty)break;
   }
   if(best?.cost){inspect('left',best.left,5,14);inspect('right',best.right,5,14);}
   continue; // Sequential leaps alone cannot establish unplayability.
  }
  inspect('left',active.filter(n=>n.pitch<split),limits.leftNotes,12);
  inspect('right',active.filter(n=>n.pitch>=split),limits.rightNotes,limits.rightSpan);
  const newRight=valid.filter(n=>Math.abs(n.start-time)<1e-7&&n.pitch>=split);
  if(newRight.length){
   const pitches=[...new Set(newRight.map(n=>n.pitch))].sort((a,b)=>a-b);
   if(previous){
    const distance=Math.abs(pianoCenter(pitches)-pianoCenter(previous.pitches));
    const allowance=pianoLeapAllowance(time-previous.start,p.bpm);
    if(distance>allowance+1e-7)issues.push({kind:'leap',hand:'right',measure,beat,
      message:`Right hand: ${Math.round(distance)}-semitone move in ${((time-previous.start)*60/Math.max(40,p.bpm)).toFixed(2)} s`});
   }
   previous={start:time,pitches};
  }
 }
 return issues;
}

type InstrumentRangeContext=Pick<Project,'bandoneonModels'|'transposeSemitones'>;
export function instrumentRange(inst:Instrument,project?:InstrumentRangeContext):[number,number]{
 const family=instrumentFamily(inst);
 return family==='Bandoneon'?[...bandoneonProfile(bandoneonModelForPart(project,inst)).range]:INSTRUMENT_CAPABILITIES[family].range;
}
export function instrumentPitchPlayable(inst:Instrument,pitch:number,project?:InstrumentRangeContext):boolean{
 if(!Number.isInteger(pitch))return false;
 const family=instrumentFamily(inst);
 if(family==='Bandoneon')return isBandoneonPitchPlayable(pitch,bandoneonModelForPart(project,inst));
 const [low,high]=INSTRUMENT_CAPABILITIES[family].range;
 return pitch>=low&&pitch<=high;
}
/** Only the bandoneon layout has a per-part physical key map. Convert its
 * concert-pitch bounds and note checks to the editor's pre-global-transpose coordinates.
 * Other instruments retain their existing written-range behavior. */
export function writtenInstrumentRange(inst:Instrument,project?:InstrumentRangeContext):[number,number]{
 const [low,high]=instrumentRange(inst,project),shift=inst.startsWith('Bandoneon')?(project?.transposeSemitones??0):0;
 return [Math.max(0,low-shift),Math.min(127,high-shift)];
}
export function writtenInstrumentPitchPlayable(inst:Instrument,pitch:number,project?:InstrumentRangeContext):boolean{
 const shift=inst.startsWith('Bandoneon')?(project?.transposeSemitones??0):0;
 return Number.isInteger(pitch)&&pitch>=0&&pitch<=127&&instrumentPitchPlayable(inst,pitch+shift,project);
}
/** Editing coordinates are pre-global-transpose; adapted/imported pitches can
 * therefore lie beyond the default grid bounds. Never hide those notes. */
export function editablePitchRange(inst:Instrument,notes:readonly Note[],project?:InstrumentRangeContext):[number,number]{
 const [lo,hi]=writtenInstrumentRange(inst,project);
 return notes.reduce<[number,number]>((range,n)=>[Math.min(range[0],n.pitch),Math.max(range[1],n.pitch)], [lo,hi]);
}

export function convertTwoFourToFour(p:Project):Project {
  if(p.beats!==2)throw Error('Only 2/4 projects can be converted to 4/4');
  if(openingPickupBeats(p))throw Error('Disable the written pickup before converting the meter');
  if(p.bars.length%2)throw Error('An odd number of measures requires an explicit pickup/ending decision');
  if(p.importedScore||p.generatedScore||p.baseScore||Object.keys(p.protectedBars).length)throw Error('Remove or archive edited/generated score and protections before meter conversion');
  const bars:Bar[]=[];
  for(let i=0;i<p.bars.length;i+=2){
    const first=p.bars[i],second=p.bars[i+1];
    if(first.section!==second.section)throw Error(`Section boundary between measures ${i+1} and ${i+2}; choose grouping manually`);
    const mergedChanges=[...parseChordSequence(first.chord,2),...parseChordSequence(second.chord,2).map(c=>({...c,beat:c.beat+2}))];
    const mergedChord=chordSequenceFromBeats(mergedChanges,4);
    bars.push({chord:mergedChord,section:first.section,melody:[...first.melody.map(n=>({...n})),...second.melody.map(n=>({...n,start:n.start+2}))]});
  }
  return {...p,beats:4,bars,protectedBars:{},partEditions:undefined,phrasePlan:undefined};
}
const dynVelocity=DYNAMIC_VELOCITIES;
export function instrumentActivity(score:Score,inst:Instrument,barCount:number,beats:number):number {
  if(!barCount)return 0;
  let active=0;for(let b=0;b<barCount;b++)if((score[inst]??[]).some(n=>n.start<b*beats+beats&&n.start+n.duration>b*beats))active++;
  return active/barCount;
}
/** One complete figure for a measure, in concert pitch. The variant changes
 * register, starting chord tone and rhythmic placement deterministically.
 * Melody responses only occupy space after the lead phrase where possible. */
export function figureMeasure(p:Project,inst:Instrument,barIndex:number,figure:FigureKind,variation=0,history:readonly Note[]=[]):Note[] {
  if(!FIGURE_KINDS.includes(figure)||!projectInstruments(p).includes(inst)||!p.bars[barIndex])throw Error('Invalid figure, instrument or measure');
  if(!Number.isInteger(variation)||variation<0||variation>99)throw Error('Variation must be 0–99');
  const bar=p.bars[barIndex],range=writtenInstrumentRange(inst,p),offset=barIndex*p.beats;
  if(!bar.chord.trim())return [];
  const harmony=(beat:number)=>chordTones(chordAt(bar.chord,p.beats,beat));
  const chordal=figure==='chords_up'||figure==='chords_down';
  const down=figure==='notes_down'||figure==='chords_down';
  const base=inst==='Piano'?70:inst==='Contrabass'?43:inst.startsWith('Violin')?73:66;
  const canPlayChords=inst==='Piano'||inst.startsWith('Bandoneon');
  const upperFloor=inst==='Piano'?Math.max(range[0],p.pianoSplitPitch??60):range[0];
  const result:Note[]=[];
  let lastSingle:number|undefined;let lastChordCenter:number|undefined;
  const add=(pitch:number,beat:number,duration:number,velocity=76,gate?:number)=>{
    if(beat>=0&&beat<p.beats&&pitch>=range[0]&&pitch<=range[1])result.push({pitch,start:offset+beat,duration:Math.min(duration,p.beats-beat),velocity,source:'generated',...(gate===undefined?{}:{gate})});
  };
  if(figure==='countermelody'){
    const melody=bar.melody.length?bar.melody:[{pitch:base+3,start:0,duration:p.beats/2},{pitch:base,start:p.beats/2,duration:p.beats/2}];
    let previous=base-4;
    for(const n of melody){
      const tones=harmony(n.start);const desired=n.pitch-5+(variation%3-1)*2;
      const pitches=tones.map(pc=>closest(pc,desired,upperFloor,range[1]));
      const pitch=pitches.sort((a,b)=>Math.abs(a-desired)-Math.abs(b-desired)||Math.abs(a-previous)-Math.abs(b-previous))[0];
      add(pitch,n.start,Math.min(n.duration,p.beats-n.start),67);previous=pitch;
    }
  }else if(figure==='melody_response'){
    const end=bar.melody.length?Math.max(...bar.melody.map(n=>n.start+n.duration)):p.beats/2;
    const start=Math.max(p.beats/2,Math.min(p.beats-0.5,end));
    const count=Math.min(4,Math.max(1,Math.round((p.beats-start)*2)));
    for(let i=0;i<count;i++){
      const beat=start+(p.beats-start)*i/count;
      const tones=harmony(beat),pc=tones[(i+variation)%tones.length];
      add(closest(pc,base+(i%2?3:0),upperFloor,range[1]),beat,(p.beats-start)/count*0.85,74);
    }
  }else{
    // Three evenly spaced gestures for vals; preserve four-part tango figures otherwise.
    const count=p.beats===3?3:inst==='Piano'&&(p.instrumentSettings?.Piano?.difficulty??p.difficulty)==='easy'?2:4,step=p.beats/count;
    for(let i=0;i<count;i++){
      const beat=i*step,tones=harmony(beat),index=down?3-i:i;
      const shift=(variation%3-1)*3;
      if(chordal&&canPlayChords){
        // Moving inversions and occasional octave displacements in the upper
        // piano register; preserve independent bass notes in the lower staff.
        const inversion=(index+variation)%Math.max(1,tones.length);
        const reference=base+shift+(down?-index*2:index*2)+(variation%2?7:0);
        if(inst==='Piano'){
          const difficulty=p.instrumentSettings?.[inst]?.difficulty??p.difficulty??'advanced';
          const pcs=Array.from({length:Math.min(pianoHandLimits(difficulty).rightNotes,tones.length)},(_,j)=>tones[(inversion+j)%tones.length]);
          const previous=previousPianoChord([...history,...result],offset+beat,upperFloor);
          const voicing=choosePlayablePianoVoicing(pcs,reference+4,difficulty,upperFloor,range[1],previous,offset+beat,p.bpm);
          for(const pitch of voicing)add(pitch,beat,step,76+(i===0?9:0),0.8);
        }else for(let j=0;j<Math.min(3,tones.length);j++){
          const pc=tones[(inversion+j)%tones.length];
          const pitch=closest(pc,reference+j*4,upperFloor,range[1]);
          add(pitch,beat,step,76+(i===0?9:0),0.8);
        }
      }else{
        const pc=tones[(index+variation)%tones.length];
        const options=Array.from({length:range[1]-upperFloor+1},(_,n)=>upperFloor+n).filter(n=>n%12===pc);
        const target=base+shift+(down?-i*4:i*4);
        const directed=lastSingle===undefined?options:options.filter(n=>down?n<lastSingle!:n>lastSingle!);
        const candidates=directed.length?directed:options;
        const pitch=candidates.sort((a,b)=>Math.abs(a-target)-Math.abs(b-target))[0];
        if(pitch!==undefined){add(pitch,beat,step,76,0.83);lastSingle=pitch;}
      }
    }
  }
  if(inst==='Piano'){
    // Piano is a two-register texture: a MONOPHONIC bass pulse in the F clef
    // and the selected figure exclusively in the G clef. Arrastre/fist attacks
    // are optional gestures, never default multi-note left-hand chords.
    const bassCeiling=Math.min(range[1],(p.pianoSplitPitch??60)-1,55);
    for(let beat=0;beat<p.beats;beat+=p.beats===3?3:2){
      const tones=harmony(beat),pc=beat===0?tones[0]:(tones[2]??tones[0]);
      const pitch=pianoBassReinforcement(pc,beat===0?40:42,range[0],bassCeiling);
      // Argentine tango piano: a clear, percussive left-hand attack reinforces
      // the contrabass root/fifth with the same pitch class, normally one
      // octave higher. Keep it monophonic and within the bass staff.
      result.push({pitch,start:offset+beat,duration:Math.min(1,p.beats-beat),
        velocity:beat===0?114:105,accent:true,gate:0.74,source:'generated'});
    }
  }
  return result.sort((a,b)=>a.start-b.start||a.pitch-b.pitch);
}
/** Contrabass articulation/rhythm presets. Starts are local to the measure.
 * These are deterministic arranging options, not a claim about a universal tango style.
 * The existing bass figure is retained by the traditional preset in generate(). */
export function bassTechniqueFor(p:Project,barIndex:number,inst:Instrument='Contrabass',phrase?:Phrase|null):BassTechnique {
 const bar=p.bars[barIndex];if(!bar)throw Error('Invalid measure');
 return effectiveBassTechnique(p,inst,barIndex,phrase);
}
export function contrabassStyleNotes(p:Project,barIndex:number,technique:BassTechnique):Note[] {
 const bar=p.bars[barIndex];if(!bar||!BASS_TECHNIQUES.includes(technique))throw Error('Invalid bass technique or measure');
 const result:Note[]=[];
 const put=(beat:number,duration:number,toneIndex:number,velocity:number,articulation:Note['articulation'],bow:Note['technique'],gate:number)=>{
   if(beat>=p.beats)return;
   const tones=chordTones(chordAt(bar.chord,p.beats,beat));
   const pc=tones[toneIndex%tones.length];
   result.push({pitch:closest(pc,40+Math.min(2,toneIndex)*2,28,55),start:barIndex*p.beats+beat,duration:Math.min(duration,p.beats-beat),velocity,articulation,technique:bow,gate,accent:articulation==='marcato_staccato',source:'generated'});
 };
 if(technique==='pizzicato'){
   for(let beat=0;beat<p.beats;beat+=p.beats===3?3:2)put(beat,Math.min(1,p.beats-beat),beat===0?0:2,94,'staccato','pizzicato',0.32);
 }else if(technique==='arco_legato'){
   for(let beat=0;beat<p.beats;beat+=p.beats===3?3:2)put(beat,2,beat===0?0:2,81,'legato','arco',0.96);
 }else if(technique==='marcato'){
   for(let beat=0;beat<p.beats;beat++)put(beat,1,beat===0?0:2,beat===0?99:75,'marcato_staccato','arco',0.55);
 }else if(technique==='walking'){
   for(let beat=0;beat<p.beats;beat++)put(beat,1,beat===0?0:beat===2?2:1,beat%2===0?89:77,'staccato','pizzicato',0.73);
 }else if(technique==='habanera'){
   // A dotted-eighth/sixteenth-derived syncopated pulse in 4/4;
   // shortened gracefully for shorter measures.
   for(let group=0;group<p.beats;group+=4){
     put(group,0.75,0,94,'marcato_staccato','pizzicato',0.48);
     put(group+0.75,0.25,1,73,'staccato','pizzicato',0.45);
     put(group+2,1,2,87,'staccato','pizzicato',0.56);
     put(group+3,1,0,76,'staccato','pizzicato',0.52);
   }
 }
 return result;
}
export function generate(p:Project):Score {
  const roster=projectInstruments(p);
  const phrases=phraseMeasureMap(p);
  const score=Object.fromEntries(roster.map(i=>[i,[]])) as unknown as Score;
  const profile=patterns[p.profile]??patterns.traditional;
  const milonga=p.profile==='milonga'&&p.beats===2;
  const settings=p.orchestration??defaultOrchestration();
  const expression=p.expression??defaultExpression();
  for(let b=0;b<p.bars.length;b++){
    const bar=p.bars[b],offset=b*p.beats,phrase=phrases[b];
    if(!bar.chord.trim()&&!bar.melody.length)continue; // A blank measure is genuinely silent.
    const harmony=(beat:number)=>chordTones(chordAt(bar.chord,p.beats,beat));
    const tones=harmony(0),root=tones[0];
    // Generate primary lines first so followers can copy the actual generated notes.
    const leadPriority=(inst:Instrument)=>effectiveRole(p,inst,b,phrase)==='melody'?
      (inst.startsWith('Voice')?2:phrase&&inst==='Violin I'?1:0):0;
    const order:Instrument[]=[...roster].sort((left,right)=>leadPriority(right)-leadPriority(left));
    for(const inst of order){
      const configuredRole=effectiveRole(p,inst,b,phrase),notes=score[inst],range=writtenInstrumentRange(inst,p);
      if(!bar.chord.trim() && configuredRole!=='melody' && configuredRole!=='variation')continue; // No invented harmony before chord entry.
      const cfg=p.instrumentSettings?.[inst]; const difficulty=cfg?.difficulty??p.difficulty??'advanced';
      const activity=phrase?effectiveActivity(p,inst,b,phrase):Math.max(0,Math.min(1,cfg?.activity??(inst.startsWith('Voice')?0:0.9)));
      const intentionalRest=configuredRole==='rest';
      // Violin II harmony is a real second line to Violin I's melody, not an
      // independently sparse accompaniment. Respect explicit Rest/zero activity.
      const violinDuet=inst==='Violin II'&&configuredRole==='harmony'&&
        effectiveRole(p,'Violin I',b,phrase)==='melody';
      const voiceLead=roster.find(i=>i.startsWith('Voice')&&effectiveRole(p,i,b,phrase)==='melody');
      const voiceDuet=inst.startsWith('Voice')&&inst!==voiceLead&&configuredRole==='harmony'&&!!voiceLead;
      const plannedActive=plannedMeasureActive(p,inst,b,phrase);
      const activeBar=plannedActive??(!intentionalRest && activity>0 &&
        (violinDuet||voiceDuet||((b*7+roster.indexOf(inst)*3)%100)<Math.round(activity*100)));
      if(!activeBar)continue;
      const role=(configuredRole==='fill' && inst.startsWith('Bandoneon'))?(bar.melody.length?'harmony':'chords'):(configuredRole==='harmony'&&!bar.melody.length&&!violinDuet&&!voiceDuet?'chords':configuredRole);
      const sectionDyn=expression.sections[bar.section]??'mf';
      const dynamicScale=expression.enabled?(dynVelocity[sectionDyn]/88):1;
      const difficultyBoost=difficulty==='advanced'?1:difficulty==='intermediate'?0.84:0.65;
      const put=(pitch:number,start:number,duration:number,velocity=80,technique?:Note['technique'],gate?:number)=>{
        if(inst.startsWith('Bandoneon')&&!writtenInstrumentPitchPlayable(inst,pitch,p)){
          pitch=nearestPlayablePitch(pitch,range[0],range[1],undefined,n=>writtenInstrumentPitchPlayable(inst,n,p)).pitch;
          if(!writtenInstrumentPitchPlayable(inst,pitch,p))return;
        }
        if(pitch>=0&&pitch<=127&&duration>0&&start>=0&&start<p.beats)
          notes.push({pitch,start:offset+start,duration:Math.min(duration,p.beats-start),velocity:Math.max(35,Math.min(127,Math.round(velocity*dynamicScale+(cfg?.dynamicsOffset??0)))),accent:Math.abs(start-Math.round(start))<0.001&&(p.beats===3?Math.round(start)===0:(profile.strongBeats?Math.round(start)%2===0:true)),technique,source:'generated',...(gate===undefined?{}:{gate})});
      };
      const putPianoChord=(pcs:readonly number[],target:number,beat:number,duration:number,velocity:number,gate:number)=>{
        const floor=Math.max(range[0],p.pianoSplitPitch??60),previous=previousPianoChord(notes,offset+beat,floor);
        const voicing=choosePlayablePianoVoicing(pcs,target,difficulty,floor,range[1],previous,offset+beat,p.bpm);
        for(const pitch of voicing)put(pitch,beat,duration,velocity,undefined,gate);
      };
      // Bandoneon chordal playing: limited compact voicings rather than unrestricted piano chords.
      // A 'fill' part may combine a melodic response with short accompaniment chords.
      // Optional guitar, woodwinds and brass use instrument-aware arranging rather
      // than the generic polyphonic accompaniment fallback. Notes remain concert pitch.
      const family=instrumentFamily(inst);
      if(['Guitar','Clarinet','Flute','Trumpet','Trombone'].includes(family)){
        const mono=family!=='Guitar';
        const target=family==='Guitar'?60:family==='Clarinet'?72:family==='Flute'?81:family==='Trumpet'?72:57;
        const playable=(pc:number,near=target)=>closest(pc,near,range[0],range[1]);
        if(role==='bass'){
          const at=p.beats===3?[0,2]:milonga?[0,1]:[0,2].filter(x=>x<p.beats);
          for(const beat of at){
            const pcs=harmony(beat);
            put(playable(pcs[beat===0?0:2]??pcs[0],family==='Trombone'?48:family==='Guitar'?48:target-8),beat,Math.min(0.9,p.beats-beat),76);
          }
          continue;
        }
        if(role==='melody'||role==='variation'||role==='harmony'){
          for(const n of bar.melody){
            const pcs=harmony(n.start);
            let pitch=role==='harmony'?playable(pcs[1]??pcs[0],n.pitch-4):Math.max(range[0],Math.min(range[1],n.pitch));
            if(role==='variation'&&n.duration>=1.5){
              put(pitch,n.start,n.duration/2,78);
              put(playable(pcs[(b+1)%pcs.length],pitch),n.start+n.duration/2,n.duration/2,75);
            }else put(pitch,n.start,n.duration,82);
          }
          continue;
        }
        if(role==='chords'||role==='fill'){
          const rhythm=p.beats===3?[1,2]:milonga?[0.5,1.5]:[0,2].filter(x=>x<p.beats);
          for(const beat of rhythm){
            const pcs=harmony(beat);
            if(mono){
              // A single playable tone per event, never brass/woodwind block chords.
              const index=family==='Trombone'?0:family==='Flute'?2:1;
              put(playable(pcs[index%pcs.length],target),beat,Math.min(family==='Flute'?0.75:0.65,p.beats-beat),72);
            }else{
              // Guitar: compact upper-string voicings, no arbitrary piano clusters.
              const candidates=pcs.slice(0,difficulty==='easy'?2:3).map((pc,j)=>playable(pc,55+j*5));
              const voicing=[...new Set(candidates)].sort((a,b)=>a-b);
              // Keep a modest span; detailed fingering depends on tuning/capo.
              for(const pitch of voicing.filter(pitch=>pitch-voicing[0]<=12))
                put(pitch,beat,Math.min(0.75,p.beats-beat),74,undefined,0.7);
            }
          }
          continue;
        }
      }
      if(inst.startsWith('Bandoneon')&&(role==='chords'||configuredRole==='fill')){
        const chordBeats=p.beats===3?[1,2]:milonga?[0.5,1.5]:[0,2].filter(beat=>beat<p.beats);
        const maxNotes=difficulty==='easy'?2:3;
        for(const beat of chordBeats){
          const pcs=harmony(beat);
          const voicing=[...new Set(pcs.slice(0,maxNotes).map((pc,j)=>closest(pc,58+j*5,range[0],Math.min(range[1],79))))];
          const duration=Math.min(0.75,p.beats-beat);
          // Keep the compact attack while engraving it on the written beat grid.
          const gate=Math.min(0.7,p.beats-beat)*0.72/duration;
          for(const pitch of voicing)put(pitch,beat,duration,68,undefined,gate);
        }
        if(role==='chords')continue;
        // In fill mode, continue generating the melody line on top of these chord events.
      }
      // A reviewed phrase's lead/variation role uses the shared lead melody.
      // Section-follow settings still serve accompaniment and legacy projects.
      if(inst.startsWith('Bandoneon')&&(!phrase||(configuredRole!=='melody'&&configuredRole!=='variation'))){
        const follower=settings.bandoneon[bar.section]?.[inst as 'Bandoneon I'|'Bandoneon II']??(inst==='Bandoneon I'?{target:'Violin II' as FollowTarget,method:'adapt' as FollowMethod}:undefined);
        if(follower&&follower.target!=='independent'&&follower.target!==inst){
          const source=score[follower.target]??[];
          const events=source.filter(n=>n.start>=offset&&n.start<offset+p.beats);
          if(events.length){
            for(const n of events){
              const local=n.start-offset;
              const localTones=harmony(local);
              const pitch=follower.method==='octave'?n.pitch+(n.pitch<60?12:0):follower.method==='adapt'?closest(n.pitch%12,66,range[0],range[1]):follower.method==='rhythm'?closest(localTones[(Math.floor(local)+1)%localTones.length],66,range[0],range[1]):n.pitch;
              put(pitch,local,n.duration,follower.method==='rhythm'?72:80,undefined,n.gate);
            }
            continue;
          }
        }
      }
      // Violin I was generated earlier in the instrument order. When the
      // violin I measure was manually edited, use its protected notes instead.
      // This ensures the harmony follows the *sounding* violin melody, even if
      // the lead sheet and the edited violin part differ in rhythm or pitch.
      const violinSource=violinDuet
        ? (p.protectedBars[`Violin I:${b}`]&&p.importedScore
          ? p.importedScore['Violin I'] : score['Violin I'])
            .filter(n=>n.start>=offset-1e-7&&n.start<offset+p.beats-1e-7)
            .map(n=>({...n,start:n.start-offset}))
        : [];
      const voiceSource=voiceDuet&&voiceLead
        ? (p.protectedBars[`${voiceLead}:${b}`]&&p.importedScore?p.importedScore[voiceLead]:score[voiceLead])
            .filter(n=>n.start>=offset-1e-7&&n.start<offset+p.beats-1e-7)
            .map(n=>({...n,start:n.start-offset})) : [];
      const primary=violinDuet?violinSource:voiceDuet?voiceSource:bar.melody;
      if(role==='melody'||role==='harmony'||role==='variation'){
        for(const n of primary){
          let pitch=n.pitch;
          if(role==='harmony'){
            pitch=harmony(n.start).map(pc=>closest(pc,n.pitch-4,range[0],range[1])).sort((a,b)=>Math.abs(a-(n.pitch-4))-Math.abs(b-(n.pitch-4)))[0]??pitch;
            if(Math.abs(pitch-n.pitch)<2)pitch=closest(harmony(n.start)[0],n.pitch-5,range[0],range[1]);
          }
          const inWrittenRange=(midi:number)=>inst.startsWith('Bandoneon')?midi:Math.max(range[0],Math.min(range[1],midi));
          pitch=inWrittenRange(pitch);
          if(role==='variation'&&n.duration>=1){put(pitch,n.start,n.duration/2,90);put(inWrittenRange(pitch+(b%2?2:-2)),n.start+n.duration/2,n.duration/2,75);}
          else put(pitch,n.start,n.duration,inst.startsWith('Violin')&&profile.strings?91:85,inst.startsWith('Violin')?'arco':undefined,inst.startsWith('Bandoneon')?Math.min(1,1.3/n.duration):undefined);
        }
        continue;
      }
      if(role==='bass'){
        if(inst.startsWith('Contrabass')){
          const bassStyle=bassTechniqueFor(p,b,inst,phrase);
          if(bassStyle!=='traditional'){
            for(const event of contrabassStyleNotes(p,b,bassStyle)){
              put(event.pitch,event.start-offset,event.duration,event.velocity,event.technique,event.gate);
              Object.assign(notes[notes.length-1],{articulation:event.articulation,accent:event.accent});
            }
            continue;
          }
        }
        if(milonga){
          // Milonga 2/4: habanera-derived 3+1+2+2 eighth subdivisions.
          const pulse:[number,number,number,number][]=[[0,0.75,0,96],[0.75,0.25,2,69],[1,0.5,0,83],[1.5,0.5,2,76]];
          for(const [beat,duration,tone,velocity] of pulse){
            const pcs=harmony(beat);
            put(closest(pcs[tone]??pcs[0],40,28,55),beat,duration,velocity,undefined,0.67);
          }
          continue;
        }
        if(p.beats===3){
          // Vals: grounded bass on beat 1; light fifth/approach on beat 3.
          const first=harmony(0),last=harmony(2);
          put(closest(first[0],40,28,55),0,1,98,undefined,0.82);
          put(closest(last[2]??last[0],42,28,55),2,0.85,68,undefined,0.58);
          continue;
        }
        for(let beat=0;beat<p.beats;beat+=2){
          const t0=harmony(beat),r0=t0[0];
          put(closest(beat===0?r0:t0[2]??r0,40,28,55),beat,Math.min(1,p.beats-beat),95,undefined,0.68);
          if(profile.density>=0.85&&beat+1<p.beats){const t1=harmony(beat+1),r1=t1[0];put(closest(beat===0?t1[2]??r1:r1,42,28,55),beat+1,1,72,undefined,0.52);}
        }
        continue;
      }
      if(inst.startsWith('Piano')&&role==='chords'){
        if(milonga){
          // Milonga in 2/4: piano bass reinforces contrabass root attacks
          // on both beats while upper chord stabs answer on the offbeats.
          // Preserve the same pitch class as the contrabass; do not force
          // every 3+1+2+2 bass articulation into the piano left hand.
          const bassCeiling=Math.min(range[1],(p.pianoSplitPitch??60)-1,55);
          for(const beat of [0,1]){
            const pcs=harmony(beat);
            const pitch=pianoBassReinforcement(pcs[0],40,range[0],bassCeiling);
            put(pitch,beat,Math.min(0.75,p.beats-beat),beat===0?108:96,undefined,beat===0?0.74:0.63);
          }
          for(const beat of [0.5,1.5]){
            const pcs=harmony(beat);
            putPianoChord(pcs,68,beat,0.45,beat===0.5?70:64,0.54);
          }
          continue;
        }
        if(p.beats===3){
          // Argentine vals: piano reinforces the contrabass with a decisive
          // independent left-hand root on beat 1; right-hand chord replies on
          // beats 2 and 3. Keep the bass in the F clef, not in chord voicings.
          const bassCeiling=Math.min(range[1],(p.pianoSplitPitch??60)-1,55);
          const bassRoot=harmony(0)[0];
          put(pianoBassReinforcement(bassRoot,40,range[0],bassCeiling),0,0.95,114,undefined,0.74);
          if(notes.length)notes[notes.length-1].accent=true;
          for(const beat of [1,2]){
            const pcs=harmony(beat);
            putPianoChord(pcs,beat===1?65:68,beat,0.8,beat===1?65:62,0.55);
          }
          continue;
        }
        const figure=p.pianoFigures?.[bar.section]??'chords_up';
        const variation=p.pianoFigureVariation?.[bar.section]??0;
        for(const n of figureMeasure(p,inst,b,figure,variation,notes))put(n.pitch,n.start-offset,n.duration,n.velocity,undefined,n.gate);
        continue;
      }
      if(role==='chords'){
        const beats=milonga?[0.5,1.5]:p.beats===3?[1,2]:difficulty==='easy'?[0,2]:profile.density>=0.85?[0,1,2,3]:[0,2];
        if(inst.startsWith('Violin')){
          const violin=inst as ViolinPart;
          const technique=phrase?effectiveViolinTechnique(p,inst,b,phrase):p.measureViolinTechniques?.[`${inst}:${b}`]??settings.violin[bar.section]?.[violin]??'tango_staccato';
          if(technique==='pizzicato'||technique==='tango_staccato'){
            // Standard tango chord accompaniment is monophonic and beat-based.
            // The difficulty setting does not remove beats; activity still controls
            // whether the instrument plays in a measure at all.
            for(let beat=0;beat<p.beats;beat++){
              const tones=harmony(beat);
              // Rotate chord tones; always use the chord active on this beat.
              const pc=tones[(beat+(inst==='Violin II'?1:0))%tones.length];
              const pitch=closest(pc,inst==='Violin I'?76:69,range[0],range[1]);
              const style=violinChordNoteStyle(p,bar.section,violin,beat,technique);
              put(pitch,beat,1,style.accent?82:72,style.technique);
              Object.assign(notes[notes.length-1],style);
            }
            continue;
          }
          if(technique==='arpeggio'||technique==='pizzicato_arpeggio'){
            // One four-note figure for the ENTIRE bar, not a miniature
            // arpeggio repeated on every accompaniment beat.
            for(const event of violinArpeggioMeasure(p,violin,b)){
              put(event.pitch,event.start,event.duration,73,
                technique==='pizzicato_arpeggio'?'pizzicato':'arco');
              if(technique==='pizzicato_arpeggio'){
                Object.assign(notes[notes.length-1],{articulation:'staccato',gate:0.22,accent:false});
              }
            }
            continue;
          }
          for(const beat of beats.filter(x=>x<p.beats)){
            const tones=harmony(beat),root=tones[0];
            const dur=Math.min(0.65,p.beats-beat);
            if(technique==='double_stop'&&difficulty!=='easy'){
              const pair=playableDoubleStop(tones,inst==='Violin I'?76:69);
              if(pair){for(const pitch of pair)put(pitch,beat,1,77,undefined,0.38);continue;}
            }
            if(technique==='double_stop'){
              const pcs=difficulty==='easy'?[tones[0],tones[2]??root]:[tones[0],tones[1]??root,tones[2]??root];
              pcs.forEach((pc,j)=>put(closest(pc,70+j*2,range[0],range[1]),beat+j*dur/3,dur/3,73));
            }else if(technique==='sustained'){
              put(closest(tones[1]??root,72,range[0],range[1]),beat,Math.min(1.7,p.beats-beat),66,'arco');
            }else{
              for(const pc of tones.slice(0,3))put(closest(pc,72,range[0],range[1]),beat,1,75,undefined,0.4);
            }
          }
        }else for(const beat of beats.filter(x=>x<p.beats)){
          const tones=harmony(beat),root=tones[0];
          const register=inst==='Piano'?(difficulty==='easy'?61:beat%2===0?55:(difficulty==='advanced'?76:69)):65;
          const chordCount=difficulty==='easy'?2:3;
          const gate=inst==='Piano'?0.30+profile.legato*0.45:0.42;
          for(const pc of tones.slice(0,chordCount))put(closest(pc,register,range[0],range[1]),beat,1,Math.round(65+25*profile.accent),undefined,gate);
          if(inst==='Piano'&&profile.yumba&&beat%2===1&&difficulty!=='easy')
            put(closest(root,45,43,55),beat,1,96,undefined,0.22);
        }
        continue;
      }
      if(role==='fill'&&primary.length){
        const last=primary[primary.length-1];
        if(last.start+last.duration<=p.beats-0.5){const at=Math.max(0,p.beats-1),t=harmony(at);put(closest(t[1]??t[0],70,range[0],range[1]),at,0.5,68);put(closest(t[0],72,range[0],range[1]),at+0.5,0.5,75);}
      }
      // Tango texture continuity: a bandoneon with sparse assigned material
      // receives an accompaniment figure rather than arbitrary full-measure rests.
      if(inst.startsWith('Bandoneon') && !notes.some(n=>n.start>=offset&&n.start<offset+p.beats)){
        for(const beat of (milonga?[0,0.75,1.5]:p.beats===3?[0,1,2]:difficulty==='easy'?[0,2]:[0,1,2,3]).filter(x=>x<p.beats)){
          const beatTones=harmony(beat);const pc=beatTones[(beat+(inst==='Bandoneon II'?1:0))%beatTones.length];
          put(closest(pc,inst==='Bandoneon II'?61:67,range[0],range[1]),beat,1,72,undefined,0.36);
        }
      }
    }
  }
  // Apply phrasing after role generation so follower notes get consistent articulation.
  for(const inst of roster)for(const n of score[inst]){
    const barIndex=Math.floor((n.start+1e-7)/p.beats);
    const phrase=phrases[barIndex]??null;
    const mode=measureArticulation(p,inst,barIndex,phrase);
    const explicit=p.articulation?.overrides?.[`${inst}:${barIndex}`]??plannedArticulation(p,inst,barIndex,phrase);
    if(explicit && n.articulation!==undefined){
      // A deliberate measure override takes precedence over the generated
      // violin beat pattern. Remove its custom gate so the override is audible.
      n.articulation=explicit;n.gate=undefined;
      n.accent=explicit==='marcato_staccato';
    }
    if(mode && n.articulation===undefined){
      n.articulation=mode;
      // A new phrase-level articulation supersedes a previously inferred short gate.
      if(plannedArticulation(p,inst,barIndex,phrase))n.gate=undefined;
      // Articulation changes playback gate, not the written rhythmic value.
      // Marcato has a longer release and a stronger attack than tango staccato.
      if(mode==='marcato_staccato'){
        n.accent=true;
      }else if(mode==='staccato')n.accent=false;
      else n.accent=false;
    }
    if(inst.startsWith('Violin')&&mode==='legato'&&n.technique!=='pizzicato'&&n.articulation==='legato')n.technique='arco';
  }
  return score;
}
export function mergeScores(p:Project,fresh:Score):Score {const roster=projectInstruments(p);const merged=Object.fromEntries(roster.map(i=>[i,[]])) as unknown as Score;for(const inst of roster){for(let b=0;b<p.bars.length;b++){const key=`${inst}:${b}`,from=p.protectedBars[key]&&p.importedScore?p.importedScore:fresh;merged[inst].push(...(from[inst]??[]).filter(n=>Math.floor((n.start+1e-7)/p.beats)===b).map(n=>({...n})));}}return merged;}
export function scoreStats(score:Score):number {return Object.values(score).reduce((s,notes)=>s+(notes?.length??0),0);}


/** Editing helpers operate on concert-pitch MIDI notes, before global transposition.
 * Key and chord tones guide entry but never prevent deliberate chromatic notes.
 */
export type NoteEditorContext = {
  role:Role; key:string; mode:'major'|'minor'; difficulty:Difficulty;
  range:[number,number]; articulation?:Exclude<Articulation,'auto'>;
  technique?:ViolinTechnique|BassTechnique; activity:number; dynamic:DynamicMark;
};
export function keyPitchClasses(key:string):number[] {
  const {mode}=parseKeySignature(key);
  const tonic=parsePitch(key.replace(/m$/,'')+'4');
  if(tonic===null)throw Error('Invalid tonic');
  const steps=mode==='minor'?[0,2,3,5,7,8,10]:[0,2,4,5,7,9,11];
  return steps.map(n=>(tonic+n)%12);
}
export function noteEditorContext(p:Project,inst:Instrument,barIndex:number):NoteEditorContext {
  if(!projectInstruments(p).includes(inst)||!p.bars[barIndex])throw Error('Invalid instrument or measure');
  const section=p.bars[barIndex].section;
  const key=sectionKey(p,section);
  const mode=parseKeySignature(key).mode;
  const phrase=phraseAt(p,barIndex)??null;
  return {
    role:effectiveRole(p,inst,barIndex,phrase),
    key,mode,difficulty:p.instrumentSettings?.[inst]?.difficulty??p.difficulty??'advanced',
    range:writtenInstrumentRange(inst,p),articulation:measureArticulation(p,inst,barIndex,phrase),
    technique:inst.startsWith('Contrabass')?bassTechniqueFor(p,barIndex,inst,phrase):inst.startsWith('Violin')?effectiveViolinTechnique(p,inst,barIndex,phrase):undefined,
    activity:effectiveActivity(p,inst,barIndex,phrase),
    dynamic:p.expression?.sections[section]??'mf'
  };
}
export function noteEditorPitchClass(p:Project,inst:Instrument,barIndex:number,beat:number,pitch:number):'chord'|'key'|'chromatic' {
  const ctx=noteEditorContext(p,inst,barIndex);
  const chord=chordAt(p.bars[barIndex].chord,p.beats,beat);
  const pc=((pitch%12)+12)%12;
  if(chord&&chordTones(chord).includes(pc))return 'chord';
  return keyPitchClasses(ctx.key).includes(pc)?'key':'chromatic';
}
/** Written note value and sounding length are independent. A staccato or
 * marcato quarter note remains a written quarter note: its dot/accent affects
 * playback gate and MusicXML articulation, not its notated duration.
 * An explicitly chosen rhythmic value overrides this entry default.
 */
export function newNoteWrittenDuration(p:Project,inst:Instrument,barIndex:number,beat:number,articulation:'inherit'|Exclude<Articulation,'auto'>='inherit'):number {
  const ctx=noteEditorContext(p,inst,barIndex);
  if(!Number.isFinite(beat)||beat<0||beat>=p.beats)throw Error('New note onset outside measure');
  const violinChordStyle=inst.startsWith('Violin')&&ctx.role==='chords'&&
    (ctx.technique==='pizzicato'||ctx.technique==='tango_staccato')?
    violinChordNoteStyle(p,p.bars[barIndex].section,inst as ViolinPart,beat,ctx.technique):undefined;
  const bassArticulation=inst==='Contrabass'&&ctx.technique==='marcato'?'marcato_staccato':
    inst==='Contrabass'&&ctx.technique==='arco_legato'?'legato':undefined;
  const measureOverride=p.articulation?.overrides?.[`${inst}:${barIndex}`]??plannedArticulation(p,inst,barIndex);
  const effective=articulation!=='inherit'?articulation:(measureOverride??violinChordStyle?.articulation??ctx.articulation??bassArticulation);
  // Tango marcato/staccato attacks are normally written as eighth notes;
  // their much shorter audible release is handled by the playback gate.
  // Legato retains its quarter-note default. Explicit note-length choices
  // in the editor always take precedence over this automatic suggestion.
  const length=effective==='staccato'||effective==='marcato_staccato'?0.5:
    effective==='legato'?1:
    ctx.role==='bass'?0.75:ctx.role==='chords'&&inst.startsWith('Violin')&&['arpeggio','pizzicato_arpeggio'].includes(ctx.technique??'')?p.beats/4:
    ctx.role==='chords'&&!inst.startsWith('Violin')?0.5:ctx.role==='fill'?0.5:1;
  return Math.max(0.25,Math.min(length,p.beats-beat));
}
/** Default event attributes reflect the selected part's orchestration.
 * User-edited duration, velocity, articulation and pitch remain fully editable.
 */
export function suggestedEditorNote(p:Project,inst:Instrument,barIndex:number,beat:number,pitch:number,duration?:number):Note {
  const ctx=noteEditorContext(p,inst,barIndex);
  if(!Number.isFinite(beat)||beat<0||beat>=p.beats||!writtenInstrumentPitchPlayable(inst,pitch,p))throw Error('Note outside measure or instrument range');
  const defaultDuration=ctx.role==='chords'&&inst.startsWith('Violin')&&['arpeggio','pizzicato_arpeggio'].includes(ctx.technique??'')
    ?p.beats/4:newNoteWrittenDuration(p,inst,barIndex,beat);
  const length=Math.min(duration??defaultDuration,p.beats-beat);
  if(!Number.isFinite(length)||length<=0)throw Error('Invalid note duration');
  const base=dynVelocity[ctx.dynamic]+(p.instrumentSettings?.[inst]?.dynamicsOffset??0);
  const technique=inst==='Contrabass'?(ctx.technique==='pizzicato'||ctx.technique==='walking'||ctx.technique==='habanera'?'pizzicato':'arco'):inst.startsWith('Violin')?(ctx.technique?.startsWith('pizzicato')?'pizzicato':'arco'):undefined;
  const chordStyle=inst.startsWith('Violin')&&ctx.role==='chords'&&
    (ctx.technique==='pizzicato'||ctx.technique==='tango_staccato')?
    violinChordNoteStyle(p,p.bars[barIndex].section,inst as ViolinPart,beat,ctx.technique):undefined;
  // A deliberate phrase articulation outranks the automatic beat pattern;
  // an explicit measure override still has the highest inherited priority.
  const measureOverride=p.articulation?.overrides?.[`${inst}:${barIndex}`]??plannedArticulation(p,inst,barIndex);
  return {pitch,start:barIndex*p.beats+beat,duration:length,velocity:Math.max(35,Math.min(127,Math.round(base))),
    articulation:ctx.articulation,technique,source:'manual',...chordStyle,
    ...(measureOverride?{articulation:measureOverride,accent:measureOverride==='marcato_staccato',gate:undefined}:{})};
}
/** Replace exactly one instrument-measure, retaining every other part and edit.
 * Manual material is copied into importedScore because mergeScores already uses
 * that store for protected measures. This also makes edits survive regeneration.
 */
export function replaceInstrumentMeasure(p:Project,current:Score,inst:Instrument,barIndex:number,notes:Note[],unchanged?:ReadonlySet<Note>):Project {
  if(!projectInstruments(p).includes(inst)||!p.bars[barIndex])throw Error('Invalid instrument or measure');
  const offset=barIndex*p.beats,hi=offset+p.beats,range=writtenInstrumentRange(inst,p);
  const edited=notes.map(n=>{
    if(unchanged?.has(n))return {...n};
    if(n.stringGlissando){const g=n.stringGlissando;if(!['Violin','Contrabass'].includes(instrumentFamily(inst))||n.technique==='pizzicato'||n.gesture||n.slideTo!==undefined||n.approachSlideFrom!==undefined||!Number.isInteger(g.interval)||!g.interval||n.pitch+g.interval<range[0]||n.pitch+g.interval>range[1]||!Number.isFinite(g.beats)||g.beats<=0||n.start+g.beats>p.bars.length*p.beats+1e-7)throw Error('Invalid bowed glissando endpoint or duration');}
    if(n.bowedTremolo&&(!['Violin','Contrabass'].includes(instrumentFamily(inst))||n.technique==='pizzicato'||![1,2,3].includes(n.bowedTremolo.strokes)||n.bowedTremolo.rateHz!==undefined&&(!Number.isFinite(n.bowedTremolo.rateHz)||n.bowedTremolo.rateHz<4||n.bowedTremolo.rateHz>24)))throw Error('Invalid bowed tremolo');
    if(n.pianoGlissando){const g=n.pianoGlissando;if(instrumentFamily(inst)!=='Piano'||!Number.isInteger(g.interval)||!g.interval||n.pitch+g.interval<21||n.pitch+g.interval>108||!['white','black','chromatic'].includes(g.keys)||!Number.isFinite(g.beats)||g.beats<=0||n.start+g.beats>p.bars.length*p.beats+1e-7)throw Error('Invalid piano glissando endpoint or duration');}
    if(n.pianoPedalBeats!==undefined&&(instrumentFamily(inst)!=='Piano'||!Number.isFinite(n.pianoPedalBeats)||n.pianoPedalBeats<=0||!Number.isFinite(n.pianoPedalOffset??0)||n.start+(n.pianoPedalOffset??0)<0||n.start+(n.pianoPedalOffset??0)+n.pianoPedalBeats>p.bars.length*p.beats+1e-7))throw Error('Invalid piano pedal duration');
    if(n.gesture){
      if(n.slideTo!==undefined)throw Error('Use either a legacy slide or an expressive gesture, not both');
      validateGesture(n,inst,n.gesture,range);
      if(inst.startsWith('Bandoneon')&&n.gesture.points.some(pt=>!writtenInstrumentPitchPlayable(inst,pt.pitch,p)))throw Error('Gesture targets a missing bandoneon pitch');
    }
    if(n.gate!==undefined&&(!Number.isFinite(n.gate)||n.gate<=0||n.gate>1))throw Error('Note gate must be between 0 (exclusive) and 1');
    if(n.slideTo!==undefined&&(!writtenInstrumentPitchPlayable(inst,n.slideTo,p)||inst==='Piano'||n.technique==='pizzicato'))throw Error('Slide unsupported for this instrument, technique or pitch range');
    if(n.approachSlideFrom!==undefined&&(!Number.isInteger(n.approachSlideFrom)||n.approachSlideFrom<range[0]||n.approachSlideFrom>range[1]||!inst.startsWith('Violin')||n.technique==='pizzicato'))throw Error('Violin approach slide requires a valid bowed starting pitch');
    if(n.vibrato!==undefined&&(typeof n.vibrato!=='boolean'||!inst.startsWith('Violin')||n.technique==='pizzicato'))throw Error('Vibrato marker requires a bowed violin note');
    if(n.swellTo!==undefined&&(!Number.isInteger(n.swellTo)||n.swellTo<1||n.swellTo>127||inst==='Piano'||n.technique==='pizzicato'))throw Error('Swell unsupported for this instrument, technique or velocity');
    if(n.articulation!==undefined&&!['staccato','marcato_staccato','legato'].includes(n.articulation))throw Error('Unsupported note articulation');
    if(!writtenInstrumentPitchPlayable(inst,n.pitch,p)||!Number.isFinite(n.start)||!Number.isFinite(n.duration)||n.duration<=0||n.start<offset-1e-8||n.start>=hi||n.start+n.duration>p.bars.length*p.beats+1e-8)
      throw Error(`Invalid ${inst} note: pitch, onset or duration outside measure`);
    return {...n,source:'manual' as const};
  }).sort((a,b)=>a.start-b.start||a.pitch-b.pitch);
  const replace=(score:Score):Score=>Object.fromEntries(projectInstruments(p).map(part=>[part,part===inst?
    [...(score[part]??[]).filter(n=>n.start<offset-1e-8||n.start>=hi),...edited].sort((a,b)=>a.start-b.start||a.pitch-b.pitch):
    (score[part]??[]).map(n=>({...n}))])) as Score;
  const protectedBars={...p.protectedBars};
  // Protect every measure touched by the edited notes. The note is stored once,
  // at its onset, and its duration may extend into subsequent measures.
  protectedBars[`${inst}:${barIndex}`]=true;
  for(const note of edited){
    const last=Math.min(p.bars.length-1,Math.floor((note.start+note.duration-1e-8)/p.beats));
    for(let b=barIndex+1;b<=last;b++)protectedBars[`${inst}:${b}`]=true;
  }
  return {...p,generatedScore:replace(current),importedScore:replace(p.importedScore??current),protectedBars};
}
/** Move a single onset to another measure without splitting its sounding duration.
 * Both the old and new measure are protected, and unrelated notes remain unchanged.
 */
export function replaceInstrumentNoteAcrossMeasures(p:Project,current:Score,inst:Instrument,original:Note,edited:Note):Project {
  const beats=p.beats,total=p.bars.length*beats;
  if(!Number.isFinite(edited.start)||edited.start<0||edited.start>=total||edited.start+edited.duration>total+1e-8)throw Error('Note would leave the song');
  const sourceBar=Math.floor(original.start/beats),targetBar=Math.floor(edited.start/beats);
  const source=(current[inst]??[]).filter(n=>n.start>=sourceBar*beats&&n.start<(sourceBar+1)*beats).map(n=>({...n}));
  const index=source.findIndex(n=>n.pitch===original.pitch&&Math.abs(n.start-original.start)<1e-8&&Math.abs(n.duration-original.duration)<1e-8);
  if(index<0)throw Error('Original note not found');
  source.splice(index,1);
  if(sourceBar===targetBar){source.push(edited);return replaceInstrumentMeasure(p,current,inst,sourceBar,source);}
  let next=replaceInstrumentMeasure(p,current,inst,sourceBar,source);
  const target=(next.generatedScore?.[inst]??[]).filter(n=>n.start>=targetBar*beats&&n.start<(targetBar+1)*beats).map(n=>({...n}));
  target.push(edited);
  next=replaceInstrumentMeasure(next,next.generatedScore??current,inst,targetBar,target);
  return next;
}
/** Combine two attacks without changing the score. */
export function combineNoteAttacks(one:Note,two:Note):Note{
  const [first,second]=one.start<=two.start?[one,two]:[two,one];
  if(Math.abs(first.start-second.start)<1e-8&&first.pitch!==second.pitch)
    throw Error('Select successive notes to merge pitches from separate attacks');
  const end=Math.max(first.start+first.duration,second.start+second.duration);
  const merged:Note={...first,duration:end-first.start};
  if(merged.duration!==first.duration)delete merged.rhythmSource;
  for(const [text,position,extend] of [['lyric','syllabic','melisma'],['lyric2','syllabic2','melisma2']] as const){
    if(!second[text])continue;
    if(!first[text]){
      merged[text]=second[text];
      merged[position]=second[position];
      merged[extend]=second[extend];
      continue;
    }
    const joinsNext=first[position]==='begin'||first[position]==='middle';
    const joinsPrevious=second[position]==='middle'||second[position]==='end';
    const startsInside=first[position]==='middle'||first[position]==='end';
    const endsInside=second[position]==='begin'||second[position]==='middle';
    merged[text]=first[text]+(joinsNext&&joinsPrevious?'':' ')+second[text];
    merged[position]=startsInside?(endsInside?'middle':'end'):(endsInside?'begin':'single');
    merged[extend]=second[extend];
  }
  return merged;
}
/** Combine two selected attacks into one written note spanning their full extent. */
export function mergeInstrumentNotes(p:Project,current:Score,inst:Instrument,one:Note,two:Note):{project:Project;note:Note}{
  const notes=current[inst]??[];
  if(one===two||!notes.includes(one)||!notes.includes(two))throw Error('Select two different notes in the same part');
  const [first,second]=one.start<=two.start?[one,two]:[two,one];
  const merged=combineNoteAttacks(first,second);
  const end=merged.start+merged.duration;
  const barOf=(note:Note)=>Math.floor((note.start+1e-8)/p.beats);
  const from=barOf(first),to=barOf(second);
  const remaining=notes.filter(n=>n!==one&&n!==two);
  const fromNotes=remaining.filter(n=>barOf(n)===from);
  const toNotes=from===to?[]:remaining.filter(n=>barOf(n)===to);
  const protectedEnd=[...fromNotes,...toNotes].reduce((latest,n)=>Math.max(latest,n.start+n.duration),end);
  const last=Math.ceil((protectedEnd-1e-8)/p.beats)-1;
  const imported=p.importedScore??current;
  // When extending a note protects another bar, record its current audible
  // notes as well. The protected edition must not replace them with stale data.
  const newlyProtected=(n:Note)=>barOf(n)>from&&barOf(n)<=last&&!p.protectedBars[`${inst}:${barOf(n)}`];
  let next:Project={...p,importedScore:{...imported,[inst]:[
    ...(imported[inst]??[]).filter(n=>!newlyProtected(n)),...notes.filter(newlyProtected),
  ]}};
  if(from!==to)next=replaceInstrumentMeasure(next,current,inst,to,toNotes);
  next=replaceInstrumentMeasure(next,next.generatedScore??current,inst,from,[...fromNotes,merged]);
  return {project:next,note:merged};
}

/** Remove manual protection and restore generator output for this measure only. */
export function resetInstrumentMeasure(p:Project,inst:Instrument,barIndex:number):Project {
  if(!projectInstruments(p).includes(inst)||!p.bars[barIndex])throw Error('Invalid instrument or measure');
  const protectedBars={...p.protectedBars};delete protectedBars[`${inst}:${barIndex}`];
  const next={...p,protectedBars};
  return {...next,generatedScore:mergeScores(next,generate(next))};
}
