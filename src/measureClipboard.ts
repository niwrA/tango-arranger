import {moveTempoExpressions,validateTempoExpressions,type TempoExpressions} from './tempoExpressions';
import {generate,mergeScores,writtenInstrumentPitchPlayable,projectInstruments,openingPickupBeats,type Project,type Score,type Note,type Instrument,type Bar,type Role,type MeasureDynamics,type Articulation,type ViolinTechnique,type BassTechnique} from './music';

/** Zero-based, inclusive ranges internally. User-facing controls use 1-based measures. */
export type MeasureRange={start:number;end:number};
export type MeasureFields={chords:boolean;melody:boolean;notes:boolean;lyrics:boolean;settings:boolean};
export const ALL_MEASURE_FIELDS:MeasureFields={chords:true,melody:true,notes:true,lyrics:true,settings:true};
type Slot={role:Role|null;dynamic:MeasureDynamics|null;articulation:Exclude<Articulation,'auto'>|null;violin:ViolinTechnique|null;bass:BassTechnique|null};
export type MeasureClipboard={
 version:1;beats:number;count:number;sourceStart:number;instruments:Instrument[];
 fields:MeasureFields;bars:Bar[];parts:Record<Instrument,{notes:Note[];slots:Slot[]}>;
 expressionRanges:NonNullable<Project['expressionRanges']>;
 tempoExpressions?:TempoExpressions;
};
export type PasteMode='overwrite'|'insert';
export type PastePreview={length:number;destination:number;mode:PasteMode;newTotal:number;incomingNotes:number;replacedNotes:number;protectedMeasures:number;warning:string};
const deep=<T>(value:T):T=>JSON.parse(JSON.stringify(value)) as T;
const emptySlot=():Slot=>({role:null,dynamic:null,articulation:null,violin:null,bass:null});
const fieldsPresent=(f:MeasureFields)=>f.chords||f.melody||f.notes||f.settings;
const lyricKeys=['lyric','lyric2','syllabic','syllabic2','melisma','melisma2','leadToken'] as const;
function lyricFree(note:Note):Note{
 const result={...note};
 for(const key of lyricKeys)delete result[key];
 return result;
}
function validateRange(p:Project,range:MeasureRange):void{
 if(!Number.isInteger(range.start)||!Number.isInteger(range.end)||range.start<0||range.end<range.start||range.end>=p.bars.length)
   throw Error('Select an existing, contiguous measure range');
}
function validateInstruments(p:Project,instruments:readonly Instrument[]):void{
 const roster=projectInstruments(p);
 if(!instruments.length||new Set(instruments).size!==instruments.length||instruments.some(i=>!roster.includes(i)))
   throw Error('Select one or more existing instruments');
}
const onsetBar=(note:Note,beats:number)=>Math.floor((note.start+1e-7)/beats);
function cloneScore(score:Score|undefined):Score|undefined{
 return score?Object.fromEntries(Object.entries(score).map(([inst,notes])=>[inst,notes.map(deep)])):undefined;
}
function applyScoreSelection(score:Score|undefined,inst:Instrument,range:MeasureRange,replacement:Note[],beats:number):Score{
 const next=cloneScore(score)??{};
 next[inst]=[...(next[inst]??[]).filter(n=>onsetBar(n,beats)<range.start||onsetBar(n,beats)>range.end),...replacement.map(deep)]
   .sort((a,b)=>a.start-b.start||a.pitch-b.pitch);
 return next;
}
function setSlot(p:Project,inst:Instrument,bar:number,slot:Slot):void{
 const key=inst+':'+bar;
 p.measureRoles??={};
 p.measureDynamics??={};
 p.articulation??={phraseBars:8,enabled:true,overrides:{}};
 p.measureViolinTechniques??={};
 p.measureBassTechniques??={};
 if(slot.role===null)delete p.measureRoles[key];else p.measureRoles[key]=slot.role;
 if(slot.dynamic===null)delete p.measureDynamics[key];else p.measureDynamics[key]=deep(slot.dynamic);
 if(slot.articulation===null)delete p.articulation.overrides[key];else if(inst.startsWith('Violin')||inst.startsWith('Bandoneon'))p.articulation.overrides[key]=slot.articulation;
 if(inst.startsWith('Violin')){
  if(slot.violin===null)delete p.measureViolinTechniques[key];else p.measureViolinTechniques[key]=slot.violin;
 }
 if(inst.startsWith('Contrabass')){
  if(slot.bass===null)delete p.measureBassTechniques[key];else p.measureBassTechniques[key]=slot.bass;
 }
}
export function copyMeasureRange(p:Project,score:Score,range:MeasureRange,instruments:Instrument[],fields:MeasureFields):MeasureClipboard{
 validateRange(p,range);
 if(!fieldsPresent(fields))throw Error('Select something to copy');
 if(fields.lyrics&&!fields.notes&&!fields.melody)throw Error('Copy lyrics together with instrument notes or lead melody');
 if(fields.notes||fields.settings)validateInstruments(p,instruments);
 const from=range.start*p.beats,to=(range.end+1)*p.beats,count=range.end-range.start+1;
 const bars=p.bars.slice(range.start,range.end+1).map(bar=>{
  const result=deep(bar);
  if(!fields.lyrics)result.melody=result.melody.map(lyricFree);
  return result;
 });
 const parts:MeasureClipboard['parts']={};
 for(const inst of fields.notes||fields.settings?instruments:[]){
  const notes=fields.notes?(score[inst]??[]).filter(n=>n.start>=from-1e-7&&n.start<to-1e-7)
    .map(n=>({...deep(fields.lyrics?n:lyricFree(n)),start:n.start-from,duration:Math.min(n.duration,to-n.start)})):[];
  const slots:Slot[]=Array.from({length:count},(_,i)=>{
   if(!fields.settings)return emptySlot();
   const bar=range.start+i,key=inst+':'+bar;
   const section=p.bars[bar].section;
   return {
    role:p.measureRoles?.[key]??p.roles[section]?.[inst]??'rest',
    dynamic:p.measureDynamics?.[key]?deep(p.measureDynamics[key]):null,
    articulation:p.articulation?.overrides?.[key]??null,
    violin:p.measureViolinTechniques?.[key]??null,
    bass:p.measureBassTechniques?.[key]??null
   };
  });
  parts[inst]={notes,slots};
 }
 const expressionRanges=fields.settings?(p.expressionRanges??[]).filter(r=>
   instruments.includes(r.instrument)&&r.startMeasure>=range.start&&r.endMeasure<=range.end)
   .map(r=>({...deep(r),startMeasure:r.startMeasure-range.start,endMeasure:r.endMeasure-range.start})):[];
 const includeTempo=fields.settings&&instruments.length===projectInstruments(p).length;
 const tempoExpressions:TempoExpressions|undefined=includeTempo&&p.tempoExpressions?{
  ritardandos:p.tempoExpressions.ritardandos.filter(r=>r.startMeasure>=range.start&&r.endMeasure<=range.end).map(r=>({...deep(r),startMeasure:r.startMeasure-range.start,endMeasure:r.endMeasure-range.start})),
  fermatas:p.tempoExpressions.fermatas.filter(r=>r.measure>=range.start&&r.measure<=range.end).map(r=>({...deep(r),measure:r.measure-range.start})),
  aTempoMeasures:p.tempoExpressions.aTempoMeasures.filter(m=>m>=range.start&&m<=range.end).map(m=>m-range.start)
 }:undefined;
 return {version:1,beats:p.beats,count,sourceStart:range.start,instruments:[...(fields.notes||fields.settings?instruments:[])],fields:deep(fields),bars,parts,expressionRanges,tempoExpressions};
}
function targetPairs(p:Project,clip:MeasureClipboard,targetInstrument?:Instrument):[Instrument,Instrument][]{
 if(targetInstrument){
  if(clip.instruments.length!==1)throw Error('Choose a single source instrument for cross-instrument paste');
  if(!projectInstruments(p).includes(targetInstrument))throw Error('Destination instrument is not in this song');
  return [[clip.instruments[0],targetInstrument]];
 }
 const roster=projectInstruments(p);
 if(clip.instruments.some(i=>!roster.includes(i)))throw Error('The destination song is missing an instrument');
 return clip.instruments.map(i=>[i,i]);
}
function validateFields(clip:MeasureClipboard,fields:MeasureFields):void{
 if(!fieldsPresent(fields))throw Error('Select something to paste');
 if(fields.lyrics&&!fields.notes&&!fields.melody)throw Error('Paste lyrics together with instrument notes or lead melody');
 for(const key of Object.keys(fields) as (keyof MeasureFields)[])if(fields[key]&&!clip.fields[key])
   throw Error('The copied measures do not contain '+key);
}
function remapMeasureRecord<T>(values:Record<string,T>|undefined,map:(measure:number)=>number|null):Record<string,T>|undefined{
 if(!values)return undefined;
 const next:Record<string,T>={};
 for(const [key,value] of Object.entries(values)){
  const pos=key.lastIndexOf(':'),measure=Number(key.slice(pos+1));
  if(pos<0||!Number.isInteger(measure)){next[key]=deep(value);continue;}
  const mapped=map(measure);
  if(mapped!==null)next[key.slice(0,pos+1)+mapped]=deep(value);
 }
 return next;
}
type ShiftMode='insert'|'delete';
function transformScore(score:Score|undefined,mode:ShiftMode,from:number,to:number,beats:number):Score|undefined{
 if(!score)return undefined;
 const left=from*beats,right=to*beats,delta=right-left;
 return Object.fromEntries(Object.entries(score).map(([inst,notes])=>[inst,notes.flatMap(note=>{
  if(mode==='insert'){
   if(note.start>=left-1e-7)return [{...deep(note),start:note.start+delta}];
   const n=deep(note);
   if(n.start+n.duration>left)n.duration=Math.max(0,left-n.start);
   return n.duration>1e-8?[n]:[];
  }
  if(note.start>=left-1e-7&&note.start<right-1e-7)return [];
  const n=deep(note);
  if(note.start>=right-1e-7)n.start-=delta;
  else if(n.start+n.duration>left)n.duration=Math.max(0,left-n.start);
  return n.duration>1e-8?[n]:[];
 })])) as Score;
}
function transformEditions(p:Project,mode:ShiftMode,from:number,to:number):Project['partEditions']{
 if(!p.partEditions)return undefined;
 const count=to-from,translate=(bar:number)=>mode==='insert'?(bar>=from?bar+count:bar):(bar>=from&&bar<to?null:bar>=to?bar-count:bar);
 const result=deep(p.partEditions);
 for(const editions of Object.values(result))for(const edition of Object.values(editions??{})){
  if(!edition)continue;
  edition.notes=transformScore({part:edition.notes},mode,from,to,p.beats)!.part;
  if(edition.importedNotes)edition.importedNotes=transformScore({part:edition.importedNotes},mode,from,to,p.beats)!.part;
  edition.protectedMeasures=edition.protectedMeasures.map(translate).filter((b):b is number=>b!==null);
  edition.sourceSignature='structure-edited:'+edition.sourceSignature;
 }
 return result;
}
function transformRanges(ranges:Project['expressionRanges'],mode:ShiftMode,from:number,to:number,beats:number):Project['expressionRanges']{
 if(!ranges)return undefined;
 const count=to-from;
 return ranges.flatMap(range=>{
  const r=deep(range);
  if(mode==='insert'){
   if(r.startMeasure>=from)r.startMeasure+=count;
   if(r.endMeasure>=from)r.endMeasure+=count;
   return [r];
  }
  if(r.endMeasure<from)return [r];
  if(r.startMeasure>=to){r.startMeasure-=count;r.endMeasure-=count;return [r];}
  // A removed hairpin is not reattached to unrelated notes.
  if(r.startMeasure>=from&&r.endMeasure<to)return [];
  if(r.startMeasure>=from){r.startMeasure=from;r.startBeat=0;}
  if(r.endMeasure>=to)r.endMeasure-=count;
  else{r.endMeasure=from-1;r.endBeat=beats;}
  return r.endMeasure>=r.startMeasure?[r]:[];
 });
}
function structuralEdit(p:Project,mode:ShiftMode,from:number,to:number):Project{
 const count=to-from;
 const map=(bar:number)=>mode==='insert'?(bar>=from?bar+count:bar):(bar>=from&&bar<to?null:bar>=to?bar-count:bar);
 return {
  ...p,
  tempoExpressions:moveTempoExpressions(p.tempoExpressions,mode,from,to),
  protectedBars:remapMeasureRecord(p.protectedBars,map)??{},
  measureRoles:remapMeasureRecord(p.measureRoles,map),
  measureDynamics:remapMeasureRecord(p.measureDynamics,map),
  measureViolinTechniques:remapMeasureRecord(p.measureViolinTechniques,map),
  measureBassTechniques:remapMeasureRecord(p.measureBassTechniques,map),
  articulation:p.articulation?{...p.articulation,overrides:remapMeasureRecord(p.articulation.overrides,map)??{}}:undefined,
  generatedScore:transformScore(p.generatedScore,mode,from,to,p.beats),
  importedScore:transformScore(p.importedScore,mode,from,to,p.beats),
  baseScore:transformScore(p.baseScore,mode,from,to,p.beats),
  partEditions:transformEditions(p,mode,from,to),
  expressionRanges:transformRanges(p.expressionRanges,mode,from,to,p.beats),
  phrasePlan:undefined,leadLyrics:undefined,lyricOverflow:undefined,lyricSequences:undefined
 };
}
/** Insert blank measures inside the destination section; existing absolute notes/metadata shift. */
export function insertBlankMeasures(original:Project,at:number,count:number):Project{
 if(!Number.isInteger(at)||at<0||at>original.bars.length||!Number.isInteger(count)||count<1||original.bars.length+count>512)
   throw Error('Insert 1 or more measures, up to 512 total');
 if(at===0&&openingPickupBeats(original))throw Error('Insert measures after the opening pickup');
 const label=original.bars[Math.min(at,original.bars.length-1)].section;
 const sectionLength=original.bars.filter(b=>b.section===label).length;
 if(sectionLength+count>128)throw Error('The destination section cannot exceed 128 measures');
 const next=structuralEdit(deep(original),'insert',at,at+count);
 next.bars=[...next.bars.slice(0,at),...Array.from({length:count},():Bar=>({chord:'',melody:[],section:label})),...next.bars.slice(at)];
 return next;
}
/** Delete an interval without silently deleting a complete section or any other edition. */
export function deleteMeasureRange(original:Project,range:MeasureRange):Project{
 validateRange(original,range);
 const from=range.start,to=range.end+1,count=to-from;
 if(count>=original.bars.length)throw Error('The song must retain at least one measure');
 const hasPickup=Boolean(openingPickupBeats(original));
 const sectionBars=hasPickup?original.bars.slice(1):original.bars;
 const sections=[...new Set(sectionBars.map(b=>b.section))];
 for(const section of sections){
  const positions=original.bars.flatMap((bar,i)=>bar.section===section&&!(i===0&&hasPickup)?[i]:[]);
  if(positions.every(i=>i>=from&&i<to))throw Error('Delete a complete section using Delete section instead');
 }
 const next=structuralEdit(deep(original),'delete',from,to);
 next.bars=next.bars.filter((_,i)=>i<from||i>=to);
 return next;
}

/** Cut expression curves at selection edges without changing their shape outside it. */
function withoutExpressionInside(ranges:Project['expressionRanges'],range:MeasureRange,instruments:readonly Instrument[],beats:number):Project['expressionRanges']{
 if(!ranges)return undefined;
 const left=range.start*beats,right=(range.end+1)*beats;
 return ranges.flatMap(source=>{
  const r=deep(source);
  if(!instruments.includes(r.instrument))return [r];
  const first=r.startMeasure*beats+(r.startBeat??0);
  const last=r.endMeasure*beats+(r.endBeat??beats);
  if(last<=left||first>=right)return [r];
  const at=(beat:number)=>r.from+(r.to-r.from)*Math.max(0,Math.min(1,(beat-first)/Math.max(0.00001,last-first)));
  const portions:typeof r[]=[];
  if(first<left)portions.push({...r,endMeasure:range.start-1,endBeat:beats,to:at(left)});
  if(last>right)portions.push({...r,startMeasure:range.end+1,startBeat:0,from:at(right)});
  return portions;
 });
}

/** Clear content while retaining bars; cleared notes stay protected against regeneration. */
export function clearMeasureRange(original:Project,score:Score,range:MeasureRange,instruments:Instrument[],fields:MeasureFields,silence=false):Project{
 validateRange(original,range);if(!fieldsPresent(fields))throw Error('Choose something to clear');
 if(fields.lyrics&&!fields.notes&&!fields.melody)throw Error('Clear lyrics together with instrument notes or lead melody');
 if(fields.notes||fields.settings||silence)validateInstruments(original,instruments);
 const next=deep(original);
 const affected=new Set(instruments);
 for(let bar=range.start;bar<=range.end;bar++){
  if(fields.chords)next.bars[bar].chord='';
  if(fields.melody)next.bars[bar].melody=[];
  for(const inst of affected){
   const key=inst+':'+bar;
   if(fields.settings)setSlot(next,inst,bar,emptySlot());
   if(silence){next.measureRoles??={};next.measureRoles[key]='rest';}
   if(fields.notes)next.protectedBars[key]=true;
  }
 }
 if(fields.settings)next.expressionRanges=withoutExpressionInside(next.expressionRanges,range,instruments,next.beats);
 if(fields.settings&&instruments.length===projectInstruments(next).length&&next.tempoExpressions){
  const e=next.tempoExpressions;
  next.tempoExpressions={
   ritardandos:e.ritardandos.filter(r=>r.endMeasure<range.start||r.startMeasure>range.end),
   fermatas:e.fermatas.filter(f=>f.measure<range.start||f.measure>range.end),
   aTempoMeasures:e.aTempoMeasures.filter(m=>m<range.start||m>range.end)
  };
 }
 if(fields.notes){
  for(const inst of affected){
   next.generatedScore=applyScoreSelection(next.generatedScore??score,inst,range,[],next.beats);
   next.importedScore=applyScoreSelection(next.importedScore??score,inst,range,[],next.beats);
  }
 }
 if(fields.melody||fields.chords||fields.settings){
  // Regenerate only unprotected parts. The intentional empty note ranges remain protected.
  next.generatedScore=mergeScores(next,generate(next));
 }
 if(fields.chords||fields.melody||(fields.notes&&instruments.some(i=>i.startsWith('Voice'))))next.leadLyrics=undefined;
 return next;
}
export function previewMeasurePaste(p:Project,score:Score,clip:MeasureClipboard,destination:number,mode:PasteMode,fields:MeasureFields,targetInstrument?:Instrument):PastePreview{
 if(clip.version!==1||clip.beats!==p.beats)throw Error('Incompatible copied measures / time signature');
 validateFields(clip,fields);
 if(!Number.isInteger(destination)||destination<0||destination>p.bars.length)throw Error('Choose a valid destination measure');
 if(mode==='overwrite'&&destination+clip.count>p.bars.length)throw Error('Copied measures do not fit: choose Insert before');
 if(mode==='insert'&&p.bars.length+clip.count>512)throw Error('Maximum 512 measures');
 const pairs=(fields.notes||fields.settings)?targetPairs(p,clip,targetInstrument):[];
 if(mode==='insert'){
  const label=p.bars[Math.min(destination,p.bars.length-1)].section;
  if(p.bars.filter(b=>b.section===label).length+clip.count>128)throw Error('The destination section cannot exceed 128 measures');
 }
 const replacement=fields.notes?pairs.reduce((sum,[source])=>sum+clip.parts[source].notes.length,0):0;
 const existing=fields.notes&&mode==='overwrite'?pairs.reduce((sum,[,target])=>
   sum+(score[target]??[]).filter(n=>onsetBar(n,p.beats)>=destination&&onsetBar(n,p.beats)<destination+clip.count).length,0):0;
 const protectedMeasures=fields.notes&&mode==='overwrite'?pairs.reduce((sum,[,target])=>sum+
   Array.from({length:clip.count},(_,i)=>Number(!!p.protectedBars[target+':'+(destination+i)])).reduce((a,b)=>a+b,0),0):0;
 const warnings:string[]=[];
 if(protectedMeasures)warnings.push(protectedMeasures+' protected instrument-measures will be overwritten');
 if(mode==='insert'&&p.phrasePlan)warnings.push('the phrase plan will need to be rebuilt');
 if(mode==='insert'&&p.leadLyrics)warnings.push('the lyrics source will need a fresh read-back');
 if(fields.notes&&fields.lyrics)warnings.push('Voice syllables follow the copied notes');
 return {length:clip.count,destination,mode,newTotal:p.bars.length+(mode==='insert'?clip.count:0),incomingNotes:replacement,replacedNotes:existing,protectedMeasures,warning:warnings.join('; ')};
}
export function pasteMeasureRange(original:Project,score:Score,clip:MeasureClipboard,destination:number,mode:PasteMode,fields:MeasureFields,targetInstrument?:Instrument):Project{
 previewMeasurePaste(original,score,clip,destination,mode,fields,targetInstrument);
 const next=mode==='insert'?insertBlankMeasures(original,destination,clip.count):deep(original);
 const pairs=(fields.notes||fields.settings)?targetPairs(next,clip,targetInstrument):[];
 const targetScore=mode==='insert'?(next.generatedScore??generate(next)):score;
 const targetImported=mode==='insert'?(next.importedScore??targetScore):(next.importedScore??score);
 for(let i=0;i<clip.count;i++){
  const index=destination+i,bar=next.bars[index],copied=clip.bars[i];
  if(fields.chords)bar.chord=copied.chord;
  if(fields.melody)bar.melody=deep(fields.lyrics?copied.melody:copied.melody.map(lyricFree));
  // Destination section/key signature is never overwritten by measure pasting.
 }
 if(fields.notes)for(const [source,target] of pairs){
  const begin=destination*next.beats,end=(destination+clip.count)*next.beats;
  const notes=clip.parts[source].notes.map(note=>{
   const n=deep(fields.lyrics?note:lyricFree(note));delete n.leadToken;
   if(source!==target&&(n.gesture||n.vibrato||n.approachSlideFrom!==undefined||n.slideTo!==undefined||n.stringMidi!==undefined||n.handPosition||n.finger))
     throw Error('Cross-instrument paste contains technique or fingering data. Edit that ornament separately before transferring.');
   n.start+=begin;n.duration=Math.min(n.duration,end-n.start);n.source='manual';
   if(!writtenInstrumentPitchPlayable(target,n.pitch,next)||n.slideTo!==undefined&&!writtenInstrumentPitchPlayable(target,n.slideTo,next)
     ||n.approachSlideFrom!==undefined&&!writtenInstrumentPitchPlayable(target,n.approachSlideFrom,next))
     throw Error('A note is outside the playable range of '+target+'. No changes applied.');
   return n;
  });
  const range={start:destination,end:destination+clip.count-1};
  next.generatedScore=applyScoreSelection(next.generatedScore??targetScore,target,range,notes,next.beats);
  next.importedScore=applyScoreSelection(next.importedScore??targetImported,target,range,notes,next.beats);
  for(let index=range.start;index<=range.end;index++)next.protectedBars[target+':'+index]=true;
 }
 if(fields.settings){
  for(const [source,target] of pairs)for(let i=0;i<clip.count;i++)
   setSlot(next,target,destination+i,clip.parts[source].slots[i]);
  const existing=withoutExpressionInside(next.expressionRanges,{start:destination,end:destination+clip.count-1},pairs.map(([,target])=>target),next.beats)??[];
  const copied=pairs.flatMap(([source,target])=>clip.expressionRanges.filter(r=>r.instrument===source)
   .map(r=>({...deep(r),instrument:target,startMeasure:r.startMeasure+destination,endMeasure:r.endMeasure+destination})));
  next.expressionRanges=[...existing,...copied];
  if(clip.tempoExpressions&&pairs.length===projectInstruments(next).length&&!targetInstrument){
   const window={start:destination,end:destination+clip.count-1};
   const old=next.tempoExpressions??{ritardandos:[],fermatas:[],aTempoMeasures:[]};
   const saved=clip.tempoExpressions,copy=<T>(x:T):T=>deep(x);
   next.tempoExpressions={
    ritardandos:[...old.ritardandos.filter(r=>r.endMeasure<window.start||r.startMeasure>window.end),
      ...saved.ritardandos.map(r=>({...copy(r),startMeasure:r.startMeasure+destination,endMeasure:r.endMeasure+destination}))],
    fermatas:[...old.fermatas.filter(f=>f.measure<window.start||f.measure>window.end),
      ...saved.fermatas.map(f=>({...copy(f),measure:f.measure+destination}))],
    aTempoMeasures:[...old.aTempoMeasures.filter(m=>m<window.start||m>window.end),
      ...saved.aTempoMeasures.map(m=>m+destination)]
   };
   validateTempoExpressions(next,next.tempoExpressions);
  }
 }
 if(fields.chords||fields.melody||fields.settings)next.generatedScore=mergeScores(next,generate(next));
 if(fields.chords||fields.melody||(fields.notes&&pairs.some(([,target])=>target.startsWith('Voice'))))next.leadLyrics=undefined;
 return next;
}


/** A move is one atomic project edit, not a clipboard operation: take the
 * selected material from its current position and place it at a destination.
 * For an insert the source is cleared first, then the timeline is shifted,
 * preserving note start positions and independent instrument parts. The
 * original project is never mutated, including when validation fails.
 */
export function previewMeasureMove(p:Project,score:Score,source:MeasureRange,
 instruments:Instrument[],fields:MeasureFields,destination:number,mode:PasteMode,
 targetInstrument?:Instrument):PastePreview{
 const clip=copyMeasureRange(p,score,source,instruments,fields);
 const preview=previewMeasurePaste(p,score,clip,destination,mode,fields,targetInstrument);
 if(mode==='overwrite'){
  const overlapping=destination<=source.end&&destination+clip.count-1>=source.start;
  const samePart=!(targetInstrument&&instruments.length===1&&targetInstrument!==instruments[0]);
  if(overlapping&&((fields.chords||fields.melody)||((fields.notes||fields.settings)&&samePart)))
   throw Error('Move overlaps its source. Choose a non-overlapping destination, or transfer only instrument notes to a different part.');
 }
 return preview;
}
export function moveMeasureRange(original:Project,score:Score,source:MeasureRange,
 instruments:Instrument[],fields:MeasureFields,destination:number,mode:PasteMode,
 targetInstrument?:Instrument):Project{
 previewMeasureMove(original,score,source,instruments,fields,destination,mode,targetInstrument);
 const clip=copyMeasureRange(original,score,source,instruments,fields);
 // A move removes the selected content, not the containing measures.
 // Protect empty source notes against later orchestration regeneration.
 const cleared=clearMeasureRange(original,score,source,instruments,fields,fields.notes);
 const afterClearScore=mergeScores(cleared,cleared.generatedScore??generate(cleared));
 return pasteMeasureRange(cleared,afterClearScore,clip,destination,mode,fields,targetInstrument);
}
