import {moveTempoExpressions} from './tempoExpressions';
import {sectionSpans,sectionLetter,openingPickupBeats,type Project,type Score,type Note} from './music';

/** Delete precisely one section without erasing independent later score edits.
 * Relabel following sections so names remain unique and section indices stable.
 */
export function deleteProjectSection(original:Project,index:number):Project {
 const current=JSON.parse(JSON.stringify(original)) as Project;
 const spans=sectionSpans(current);
 if(spans.length<=1)throw Error('The song must retain at least one section');
 if(!Number.isInteger(index)||index<0||index>=spans.length)throw Error('Section not found');
 const removed=spans[index],begin=removed.start,finish=begin+removed.measures;
 const before=begin*current.beats,after=finish*current.beats,delta=after-before;
 const names=new Map(spans.map((span,i)=>[span.label,i<index?sectionLetter(i):i>index?sectionLetter(i-1):'']));
 const mapName=(name:string)=>names.get(name)??name;
 const pickup=openingPickupBeats(current);
 const bars=current.bars.filter((_,i)=>i<begin||i>=finish).map((bar,i)=>({...bar,section:pickup&&i===0?sectionLetter(0):mapName(bar.section)}));
 const cloneScore=(score:Score|undefined):Score|undefined=>{
   if(!score)return undefined;
   return Object.fromEntries(Object.entries(score).map(([inst,notes])=>[inst,notes.flatMap(note=>{
     if(note.start>=before&&note.start<after)return [];
     const n:Note={...note,start:note.start>=after?note.start-delta:note.start};
     if(note.start<before&&note.start+note.duration>before)n.duration=Math.min(note.duration,before-note.start);
     return n.duration>1e-8?[n]:[];
   })])) as Score;
 };
 const sectionMap=<T>(map:Record<string,T>|undefined):Record<string,T>=>{
   const result:Record<string,T>={};
   for(const [name,value] of Object.entries(map??{})){
     const mapped=names.get(name);
     if(mapped)result[mapped]=value;
   }
   return result;
 };
 const measureMap=<T>(map:Record<string,T>|undefined):Record<string,T>=>{
   const result:Record<string,T>={};
   for(const [key,value] of Object.entries(map??{})){
     const colon=key.lastIndexOf(':');if(colon<0){result[key]=value;continue;}
     const measure=Number(key.slice(colon+1));
     if(!Number.isInteger(measure)){result[key]=value;continue;}
     if(measure>=begin&&measure<finish)continue;
     const at=measure>=finish?measure-removed.measures:measure;
     result[key.slice(0,colon+1)+at]=value;
   }
   return result;
 };
 const expressionRanges=(current.expressionRanges??[]).flatMap(range=>{
   const start=range.startMeasure*current.beats+(range.startBeat??0);
   const end=range.endMeasure*current.beats+(range.endBeat??current.beats);
   if(end>before&&start<after)return [];
   return [{...range,startMeasure:range.startMeasure>=finish?range.startMeasure-removed.measures:range.startMeasure,
     endMeasure:range.endMeasure>=finish?range.endMeasure-removed.measures:range.endMeasure}];
 });
 const orchestration=current.orchestration?{
   ...current.orchestration,
   contrabass:sectionMap(current.orchestration.contrabass),
   violin:sectionMap(current.orchestration.violin),
   bandoneon:sectionMap(current.orchestration.bandoneon)
 }:undefined;
 return {...current,bars,tempoExpressions:moveTempoExpressions(current.tempoExpressions,'delete',begin,finish),
   sectionKeys:sectionMap(current.sectionKeys),
   roles:sectionMap(current.roles),
   orchestration,
   expression:current.expression?{...current.expression,sections:sectionMap(current.expression.sections)}:undefined,
   violinMarcatoBeats:sectionMap(current.violinMarcatoBeats),
   violinArpeggioDirections:sectionMap(current.violinArpeggioDirections),
   pianoFigures:sectionMap(current.pianoFigures),
   pianoFigureVariation:sectionMap(current.pianoFigureVariation),
   measureRoles:measureMap(current.measureRoles),
   measureViolinTechniques:measureMap(current.measureViolinTechniques),
   measureBassTechniques:measureMap(current.measureBassTechniques),
   measureDynamics:measureMap(current.measureDynamics),
   articulation:current.articulation?{...current.articulation,overrides:measureMap(current.articulation.overrides)}:undefined,
   expressionRanges,
   protectedBars:measureMap(current.protectedBars),
   generatedScore:cloneScore(current.generatedScore),
   importedScore:cloneScore(current.importedScore),
   baseScore:cloneScore(current.baseScore),
   // Old absolute positions cannot safely be reused in these derived caches.
   partEditions:undefined,phrasePlan:undefined,
   // Lyrics remain attached to note events, but the manually authored source
   // has absolute bar separators: require an explicit fresh read-back.
   leadLyrics:undefined
 };
}
