import {duplicateTempoExpressions} from './tempoExpressions';
import {sectionSpans,sectionLetter,sectionKey,type Project,type Score} from './music';

export type DuplicatedSection={project:Project;sourceLabel:string;label:string;destination:number;measures:number};
/** Clone a whole section as an independent reprise. Reactivity proxies are removed
 * by JSON snapshotting the song before copying nested properties. An E reprise
 * receives the next distinct label (usually F) so section settings remain separate.
 */
export function duplicateProjectSection(original:Project,index:number):DuplicatedSection {
 const current=JSON.parse(JSON.stringify(original)) as Project;
 const spans=sectionSpans(current);
 const source=spans[index];
 if(!source)throw Error('Source section not found');
 if(spans.length>=26||current.bars.length+source.measures>512)
   throw Error('Cannot copy: maximum 26 sections and 512 measures');
 const label=sectionLetter(spans.length),sourceLabel=source.label;
 const destination=current.bars.length,shift=(destination-source.start)*current.beats;
 const end=(destination+source.measures)*current.beats;
 const clone=<T>(value:T):T=>value===undefined?value:JSON.parse(JSON.stringify(value)) as T;
 const bars=[...current.bars,...current.bars.slice(source.start,source.start+source.measures).map(bar=>({
   ...clone(bar),section:label
 }))];
 const cloneScore=(score:Score|undefined):Score|undefined=>{
   if(!score)return undefined;
   const from=source.start*current.beats,to=(source.start+source.measures)*current.beats;
   return Object.fromEntries(Object.entries(score).map(([inst,notes])=>[
     inst,[...notes.map(n=>clone(n)),...notes.filter(n=>n.start>=from&&n.start<to)
       .map(n=>({...clone(n),start:n.start+shift,duration:Math.min(n.duration,end-(n.start+shift))}))]
   ])) as Score;
 };
 const copyMeasureMap=<T>(map:Record<string,T>|undefined):Record<string,T>=>{
   const result={...(map??{})};
   for(const [key,value] of Object.entries(map??{})){
     const split=key.lastIndexOf(':');
     if(split<0)continue;
     const measure=Number(key.slice(split+1));
     if(!Number.isInteger(measure)||measure<source.start||measure>=source.start+source.measures)continue;
     result[key.slice(0,split+1)+(destination+measure-source.start)]=clone(value);
   }
   return result;
 };
 const copySectionMap=<T>(map:Record<string,T>|undefined):Record<string,T>=>{
   const result={...(map??{})};
   if(map&&Object.prototype.hasOwnProperty.call(map,sourceLabel))result[label]=clone(map[sourceLabel]);
   return result;
 };
 const copiedExpression=(current.expressionRanges??[])
   .filter(range=>range.startMeasure>=source.start&&range.endMeasure<source.start+source.measures)
   .map(range=>({...clone(range),startMeasure:range.startMeasure+destination-source.start,
     endMeasure:range.endMeasure+destination-source.start}));
 const project:Project={...current,bars,tempoExpressions:duplicateTempoExpressions(current.tempoExpressions,source.start,source.measures,destination),
   sectionKeys:{...current.sectionKeys,[label]:sectionKey(current,sourceLabel)},
   roles:copySectionMap(current.roles),
   generatedScore:cloneScore(current.generatedScore),
   importedScore:cloneScore(current.importedScore),
   baseScore:cloneScore(current.baseScore),
   protectedBars:copyMeasureMap(current.protectedBars),
   measureRoles:copyMeasureMap(current.measureRoles),
   measureViolinTechniques:copyMeasureMap(current.measureViolinTechniques),
   measureBassTechniques:copyMeasureMap(current.measureBassTechniques),
   violinMarcatoBeats:copySectionMap(current.violinMarcatoBeats),
   violinArpeggioDirections:copySectionMap(current.violinArpeggioDirections),
   pianoFigures:copySectionMap(current.pianoFigures),
   pianoFigureVariation:copySectionMap(current.pianoFigureVariation),
   measureDynamics:copyMeasureMap(current.measureDynamics),
   orchestration:current.orchestration?{
     ...current.orchestration,
     violin:copySectionMap(current.orchestration.violin),
     bandoneon:copySectionMap(current.orchestration.bandoneon),
     contrabass:copySectionMap(current.orchestration.contrabass)
   }:undefined,
   expression:current.expression?{...current.expression,sections:copySectionMap(current.expression.sections)}:undefined,
   articulation:current.articulation?{
     ...current.articulation,overrides:copyMeasureMap(current.articulation.overrides)
   }:undefined,
   expressionRanges:[...(current.expressionRanges??[]).map(range=>clone(range)),...copiedExpression]
 };
 return {project,sourceLabel,label,destination,measures:source.measures};
}
