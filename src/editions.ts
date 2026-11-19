/** Independent difficulty editions for musicians sharing the same song.
 * The legacy generatedScore/importedScore/protectedBars fields remain the
 * authoritative *active* workspace; other variants are durable snapshots.
 * Keeping this boundary makes old .tango files and existing editors work. */
import {generate,mergeScores,projectInstruments,type Difficulty,type Instrument,type Note,type PartEdition,type PartEditions,type Project,type Score} from './music';
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
  sectionArticulation:p.articulation,
  pianoFigures:p.pianoFigures,pianoVariation:p.pianoFigureVariation,
  orchestration:p.orchestration,melodyDucking:p.melodyDucking,
  violinMarcatoBeats:p.violinMarcatoBeats,
  violinArpeggioDirections:p.violinArpeggioDirections,
  measureViolinTechniques:p.measureViolinTechniques,
  measureBassTechniques:p.measureBassTechniques,
  instrument:inst,
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
 const next:Project={...saved,phrasePlan:plan===undefined?undefined:JSON.parse(JSON.stringify(plan)) as PhrasePlan};
 const score=mergeScores(next,generate(next));
 next.generatedScore=score;
 const editions:PartEditions={...(saved.partEditions??{})};
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
function createLevel(p:Project,inst:Instrument,level:Difficulty):PartEdition{
 return {notes:copyNotes(generateAtLevel(p,level)[inst]??[]),protectedMeasures:[],
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
 const target=variants[inst]?.[level]??createLevel(saved,inst,level);
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
 const selected=activeScore(p),result={} as Score,generated=new Map<Difficulty,Score>();
 for(const inst of projectInstruments(p)){
  const level=choices[inst]??activeLevel(p,inst);
  if(!EDITION_LEVELS.includes(level))throw Error('Unknown difficulty edition');
  let notes:Note[]|undefined;
  if(level===activeLevel(p,inst))notes=selected[inst];
  else notes=p.partEditions?.[inst]?.[level]?.notes;
  if(!notes){
   if(!generated.has(level))generated.set(level,generateAtLevel(p,level));
   notes=generated.get(level)?.[inst];
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
 const merged=mergeScores(selected,fresh);
 const next={...selected,generatedScore:{...(selected.generatedScore??fresh),[inst]:copyNotes(merged[inst]??[])}};
 const signatures={...(next.partEditions?.[inst]??{})};
 if(signatures[level])signatures[level]={...signatures[level]!,sourceSignature:scoreSourceSignature(next,inst)};
 return snapshotActiveEditions({...next,partEditions:{...(next.partEditions??{}),[inst]:signatures}});
}
