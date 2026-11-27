/** Independent difficulty editions for musicians sharing the same song.
 * The legacy generatedScore/importedScore/protectedBars fields remain the
 * authoritative *active* workspace; other variants are durable snapshots.
 * Keeping this boundary makes old .tango files and existing editors work. */
import {generate,mergeScores,projectInstruments,instrumentFamily,instrumentRange,instrumentPitchPlayable,chordAt,chordTones,type Difficulty,type Instrument,type Note,type PartEdition,type PartEditions,type Project,type Score} from './music';
import {phraseStyleKey,isOrchestraStyle} from './orchestraStyle';
import {validatePhrasePlan,type PhrasePlan} from './phrasePlan';

export const EDITION_LEVELS:readonly Difficulty[]=['easy','intermediate','advanced'];
export type EditionChoice=Partial<Record<Instrument,Difficulty>>;
export type EditionInfo={difficulty:Difficulty;stored:boolean;active:boolean;stale:boolean;protectedCount:number};

const copyNotes=(notes:readonly Note[]):Note[]=>notes.map(n=>JSON.parse(JSON.stringify(n)) as Note);
const copyEdition=(edition:PartEdition):PartEdition=>({
 notes:copyNotes(edition.notes),
 ...(edition.importedNotes?{importedNotes:copyNotes(edition.importedNotes)}:{}),
 protectedMeasures:[...edition.protectedMeasures],
 sourceSignature:edition.sourceSignature,
 ...(edition.generatedAt?{generatedAt:edition.generatedAt}:{})
});
const activeLevel=(p:Project,inst:Instrument):Difficulty=>p.instrumentSettings?.[inst]?.difficulty??p.difficulty??'advanced';
/** This signature intentionally ignores a musician's difficulty selection. */
export function scoreSourceSignature(p:Project,inst:Instrument):string{
 return JSON.stringify({
  bars:p.bars.map(b=>[b.section,b.chord,b.melody]),
  beats:p.beats,profile:p.profile,
  sectionKeys:p.sectionKeys,roles:p.roles,measureRoles:p.measureRoles,
  phrasePlan:p.phrasePlan,
  sectionStyles:Object.keys(p.sectionStyles??{}).length?p.sectionStyles:undefined,
  styleStrength:p.styleStrength===1?undefined:p.styleStrength,
  phraseStyles:Object.keys(p.phraseStyles??{}).length?p.phraseStyles:undefined,
  sectionArticulation:p.articulation,
  pianoFigures:p.pianoFigures,pianoVariation:p.pianoFigureVariation,
  orchestration:p.orchestration,melodyDucking:p.melodyDucking,
  violinMarcatoBeats:p.violinMarcatoBeats,
  violinArpeggioDirections:p.violinArpeggioDirections,
  measureViolinTechniques:p.measureViolinTechniques,
  measureBassTechniques:p.measureBassTechniques,
  instrument:inst,
  bandoneonModel:p.bandoneonModels?.[inst],
  bandoneonTranspose:inst.startsWith('Bandoneon')?p.transposeSemitones||undefined:undefined,
  activity:p.instrumentSettings?.[inst]?.activity,
  dynamicsOffset:p.instrumentSettings?.[inst]?.dynamicsOffset
 });
}
function activeScore(p:Project):Score{
 const base=p.generatedScore??generate(p);
 return p.importedScore&&Object.values(p.protectedBars??{}).some(Boolean)
  ?mergeScores(p,base):base;
}
function protectedMeasures(p:Project,inst:Instrument):number[]{
 const prefix=inst+':';
 return Object.entries(p.protectedBars??{}).filter(([key,yes])=>yes&&key.startsWith(prefix))
  .map(([key])=>Number(key.slice(prefix.length)))
  .filter(n=>Number.isInteger(n)&&n>=0&&n<p.bars.length).sort((a,b)=>a-b);
}
function activeSnapshot(p:Project,inst:Instrument,score:Score):PartEdition{
 const existing=p.partEditions?.[inst]?.[activeLevel(p,inst)];
 return {
  notes:copyNotes(score[inst]??[]),
  ...(p.importedScore?.[inst]?{importedNotes:copyNotes(p.importedScore[inst])}:{}),
  protectedMeasures:protectedMeasures(p,inst),
  sourceSignature:existing?.sourceSignature??scoreSourceSignature(p,inst),
  ...(existing?.generatedAt?{generatedAt:existing.generatedAt}:{})
 };
}
/** Update all currently selected parts in the portable, self-contained project.
 * This is pure: autosave and export never mutate the editing state. */
export function snapshotActiveEditions(p:Project):Project{
 const score=activeScore(p);
 const partEditions:PartEditions={...(p.partEditions??{})};
 for(const inst of projectInstruments(p)){
  const level=activeLevel(p,inst);
  partEditions[inst]={...(partEditions[inst]??{}),[level]:activeSnapshot(p,inst,score)};
 }
 return {...p,partEditions};
}
/** Applying a reviewed plan updates only active versions. Independently stored
 * difficulty editions remain intact and become stale until explicitly revised. */
export function applyPhrasePlan(p:Project,plan?:PhrasePlan):Project{
 if(plan!==undefined){
  const errors=validatePhrasePlan(p,plan);
  if(errors.length)throw Error(errors.join('; '));
 }
 const saved=snapshotActiveEditions(p);
 const priorKeys=new Set(p.phrasePlan&&!validatePhrasePlan(p,p.phrasePlan).length?p.phrasePlan.phrases.map(phraseStyleKey):[]);
 const phraseStyles=plan?.phrases.flatMap(phrase=>{
  const key=phraseStyleKey(phrase),style=p.phraseStyles?.[key];
  return priorKeys.has(key)&&isOrchestraStyle(style)?[[key,style] as const]:[];
 });
 const next:Project={...saved,phrasePlan:plan===undefined?undefined:JSON.parse(JSON.stringify(plan)) as PhrasePlan,
  phraseStyles:phraseStyles?.length?Object.fromEntries(phraseStyles):undefined};
 return regenerateActiveArrangement(next);
}
/** Record the inputs used for the newly generated active score, without
 * rewriting alternate practice editions or the protected source. */
export function regenerateActiveArrangement(project:Project):Project{
 const score=mergeScores(project,generate(project));
 const next={...project,generatedScore:score};
 const editions:PartEditions={...(project.partEditions??{})};
 for(const inst of projectInstruments(next)){
  const level=activeLevel(next,inst);
  editions[inst]={...(editions[inst]??{}),[level]:{
   ...activeSnapshot(next,inst,score),sourceSignature:scoreSourceSignature(next,inst)
  }};
 }
 return {...next,partEditions:editions};
}
function generateAtLevel(p:Project,level:Difficulty):Score{
 const settings=Object.fromEntries(projectInstruments(p).map(inst=>
  [inst,{...(p.instrumentSettings?.[inst]??{}),difficulty:level}]));
 // Generate independent difficulty baselines. Protected edits from another
 // edition must not be copied into newly created instrument parts.
 return generate({...p,importedScore:undefined,generatedScore:undefined,protectedBars:{},
   instrumentSettings:{...(p.instrumentSettings??{}),...settings}});
}
/** Derive practice parts from the actual imported advanced arrangement, not
 * the chord generator (imported songs may have no chord or melody tokens). */
export function simplifyImportedPart(p:Project,inst:Instrument,source:readonly Note[],level:Difficulty):Note[]{
 if(level==='advanced')return copyNotes(source);
 const violin=instrumentFamily(inst)==='Violin';
 const [low,high]=instrumentRange(inst,p);
 const shift=p.transposeSemitones??0;
 const ceiling=violin?(level==='easy'?83:88):high;
 const floor=low;
 const ordered=copyNotes(source).sort((a,b)=>a.start-b.start||b.pitch-a.pitch);
 const result:Note[]=[];
 const groups:Note[][]=[];
 for(const n of ordered){const last=groups.at(-1);if(last&&Math.abs(last[0].start-n.start)<1e-7)last.push(n);else groups.push([n]);}
 let previous:Note|undefined,previousOriginal:number|undefined;
 const pc=(n:number)=>(n%12+12)%12;
 const positions=(pitch:number)=>[55,62,69,76].flatMap((open,string)=>pitch>=open&&pitch<=open+(level==='easy'?7:12)?[{string,position:Math.max(0,pitch-open-7)}]:[]);
 let lastFinger:{string:number;position:number}|undefined;
 for(let g=0;g<groups.length;g++){
  const group=groups[g],start=group[0].start,bar=p.bars[Math.floor(start/p.beats)];
  const chord=bar?chordAt(bar.chord,p.beats,start%p.beats):'';
  const harmony=chord.trim()?chordTones(chord):[];
  const role=bar?p.roles?.[bar.section]?.[inst]:undefined;
  const ranked=[...group].sort((a,b)=>{
   const weight=(n:Note)=> (n.accent?3:0)+(n.lyric?5:0)+Math.min(2,n.duration)+(role==='harmony'&&harmony.includes(pc(n.pitch))?2:0)-(previousOriginal===undefined?0:Math.abs(n.pitch-previousOriginal)*.08);
   return weight(b)-weight(a)||b.pitch-a.pitch;
  });
  const chosen=violin?[ranked[0]]:group;
  if(violin&&level==='intermediate'&&group.length>1){
   const a=chosen[0],b=ranked.slice(1).find(n=>Math.abs(n.duration-a.duration)<1e-7&&[55,62,69,76].some(open=>[55,62,69,76].some(other=>Math.abs(open-other)===7&&Math.min(a.pitch+shift,n.pitch+shift)===Math.min(open,other)&&Math.max(a.pitch+shift,n.pitch+shift)===Math.max(open,other))));
   if(b)chosen.push(b);
  }
  const primary=chosen[0],original=primary.pitch;
  const short=level==='easy'?0.75:0.25;
  const next=groups[g+1]?.[0];
  const ornamental=violin&&chosen.length===1&&previous&&next&&primary.duration<short&&!primary.accent&&!primary.lyric&&!primary.lyric2&&Math.abs(start-Math.round(start))>1e-7&&Math.abs(previous.start+previous.duration-start)<1e-7&&Math.floor(previous.start/p.beats)===Math.floor(start/p.beats)&&Math.floor(next.start/p.beats)===Math.floor(start/p.beats)&&Math.abs(original-(previousOriginal??original))<=2&&Math.abs(next.pitch-original)<=2;
  if(ornamental&&previous){previous.duration+=primary.duration;continue;}
  if(violin)for(const r of result.slice(-2))if(r.start<start&&r.start+r.duration>start)r.duration=start-r.start;
  for(const n of chosen){
   const candidates=[0,-12,12,-24,24].map(o=>n.pitch+o).filter(x=>x+shift>=floor&&x+shift<=ceiling&&instrumentPitchPlayable(inst,x+shift,p));
   const cost=(x:number)=>Math.abs(x-n.pitch)*.25+(previous?Math.abs((x-previous.pitch)-(original-(previousOriginal??original)))*.8:0)+(violin?Math.min(12,...positions(x+shift).map(f=>f.position*.7+(level==='easy'&&x+shift===[55,62,69,76][f.string]?-1.5:0)+(lastFinger?Math.abs(f.position-lastFinger.position)*.6+Math.abs(f.string-lastFinger.string)*(level==='easy'?2:.5):0))):0);
   if(candidates.length&&chosen.length===1)n.pitch=candidates.sort((a,b)=>cost(a)-cost(b))[0];
   if(violin){
    delete n.stringMidi;delete n.handPosition;delete n.finger;delete n.slideTo;delete n.approachSlideFrom;delete n.gesture;delete n.xmlTieContinuation;
    if(level==='easy')delete n.vibrato;
    const fingerings=positions(n.pitch+shift).sort((a,b)=>(a.position-b.position)*4+(lastFinger?Math.abs(a.string-lastFinger.string)-Math.abs(b.string-lastFinger.string):0));
    const f=fingerings[0];
    if(f&&f.position===0){n.stringMidi=[55,62,69,76][f.string];n.handPosition='I';const stop=n.pitch+shift-n.stringMidi;n.finger=String(stop===0?0:stop<=2?1:stop<=4?2:stop<=6?3:4) as Note['finger'];}
   }
   // A derived edition is independent of the manual rhythm preset attachment in its source.
   delete n.rhythmSource;
   n.source='generated';result.push(n);
  }
  previous=primary;previousOriginal=original;
  lastFinger=positions(primary.pitch+shift).sort((a,b)=>a.position-b.position)[0];
 }
 return result.filter(n=>n.duration>0);
}
function importedAdvanced(p:Project,inst:Instrument):Note[]|undefined{
 const advanced=p.partEditions?.[inst]?.advanced;
 if(advanced?.notes.length&&(advanced.importedNotes?.length||advanced.notes.some(n=>n.source==='imported')||!(generateAtLevel(p,activeLevel(p,inst))[inst]?.length)))return advanced.notes;
 if(advanced?.importedNotes?.length)return advanced.importedNotes;
 if(activeLevel(p,inst)==='advanced'&&p.importedScore?.[inst]?.length)return activeScore(p)[inst];
 if(p.baseScore?.[inst]?.length)return p.baseScore[inst];
 return undefined;
}
function createLevel(p:Project,inst:Instrument,level:Difficulty):PartEdition{
 const source=importedAdvanced(p,inst);
 return {notes:source?.length?simplifyImportedPart(p,inst,source,level):copyNotes(generateAtLevel(p,level)[inst]??[]),protectedMeasures:[],
  sourceSignature:scoreSourceSignature(p,inst)};
}
/** Switch exactly one part without changing other players' notes or protections. */
export function switchInstrumentEdition(p:Project,inst:Instrument,level:Difficulty):Project{
 if(!projectInstruments(p).includes(inst))throw Error('Instrument not in ensemble');
 if(!EDITION_LEVELS.includes(level))throw Error('Unknown difficulty edition');
 const previous=activeLevel(p,inst);
 if(previous===level)return p;
 const saved=snapshotActiveEditions(p);
 const variants:PartEditions={...(saved.partEditions??{})};
 const existing=variants[inst]?.[level];
 const target=existing&&(existing.notes.length||existing.protectedMeasures.length||!importedAdvanced(saved,inst)?.length)?existing:createLevel(saved,inst,level);
 variants[inst]={...(variants[inst]??{}),[level]:copyEdition(target)};
 const generated=Object.fromEntries(Object.entries(saved.generatedScore??generate(saved))
  .map(([name,notes])=>[name,copyNotes(notes)])) as Score;
 generated[inst]=copyNotes(target.notes);
 const imported=Object.fromEntries(Object.entries(saved.importedScore??{})
  .map(([name,notes])=>[name,copyNotes(notes)])) as Score;
 if(target.importedNotes)imported[inst]=copyNotes(target.importedNotes);
 else delete imported[inst];
 const protectedBars=Object.fromEntries(Object.entries(saved.protectedBars??{})
  .filter(([key])=>!key.startsWith(inst+':')));
 for(const bar of target.protectedMeasures)protectedBars[inst+':'+bar]=true;
 return {...saved,partEditions:variants,
  instrumentSettings:{...(saved.instrumentSettings??{}),
   [inst]:{...(saved.instrumentSettings?.[inst]??{}),difficulty:level}},
  generatedScore:generated,
  importedScore:imported,
  protectedBars
 };
}
export function currentEditionLevel(p:Project,inst:Instrument):Difficulty{return activeLevel(p,inst);}
export function getEditionInfo(p:Project,inst:Instrument,level:Difficulty):EditionInfo{
 const active=level===activeLevel(p,inst),stored=active||!!p.partEditions?.[inst]?.[level];
 const saved=p.partEditions?.[inst]?.[level];
 return {
  difficulty:level,stored,active,
  stale:!!saved&&saved.sourceSignature!==scoreSourceSignature(p,inst),
  protectedCount:active?protectedMeasures(p,inst).length:saved?.protectedMeasures.length??0
 };
}
/** Resolve any mix of versions for print/export, including uncreated variants.
 * Missing levels are generated non-destructively and never overwrite edits. */
export function assembleEditionScore(p:Project,choices:EditionChoice={}):Score{
 const selected=activeScore(p),result={} as Score;
 for(const inst of projectInstruments(p)){
  const level=choices[inst]??activeLevel(p,inst);
  if(!EDITION_LEVELS.includes(level))throw Error('Unknown difficulty edition');
  let notes:Note[]|undefined;
  if(level===activeLevel(p,inst))notes=selected[inst];
  else notes=p.partEditions?.[inst]?.[level]?.notes;
  if(!notes||(!notes.length&&level!==activeLevel(p,inst)&&!p.partEditions?.[inst]?.[level]?.protectedMeasures.length&&importedAdvanced(p,inst)?.length)){
   notes=createLevel(p,inst,level).notes;
  }
  result[inst]=copyNotes(notes??[]);
 }
 return result;
}
/** Explicitly regenerate one edition, retaining its manually protected bars.
 * Other editions and other players remain untouched. */
export function regenerateInstrumentEdition(p:Project,inst:Instrument,level:Difficulty):Project{
 const selected=level===activeLevel(p,inst)?p:switchInstrumentEdition(p,inst,level);
 const fresh=generate(selected);
 const source=importedAdvanced(selected,inst)??selected.partEditions?.[inst]?.advanced?.notes;
 if(level!=='advanced'&&source?.length&&(importedAdvanced(selected,inst)?.length||!fresh[inst]?.length))fresh[inst]=simplifyImportedPart(selected,inst,source,level);
 const merged=mergeScores(selected,fresh);
 const next={...selected,generatedScore:{...(selected.generatedScore??fresh),[inst]:copyNotes(merged[inst]??[])}};
 const signatures={...(next.partEditions?.[inst]??{})};
 if(signatures[level])signatures[level]={...signatures[level]!,sourceSignature:scoreSourceSignature(next,inst)};
 return snapshotActiveEditions({...next,partEditions:{...(next.partEditions??{}),[inst]:signatures}});
}
