import {sectionSpans,sectionLetter,sectionKey,type Project} from './music';
/** Move the boundary between adjacent sections without moving musical time.
 * Existing note onsets, chords, instrument edits and protected measures remain
 * attached to their absolute measure numbers.
 */
export function moveLeadSectionStart(project:Project,sectionIndex:number,newStartMeasure:number):Project {
 const spans=sectionSpans(project);
 if(!Number.isInteger(sectionIndex)||sectionIndex<1||sectionIndex>=spans.length)throw Error('Choose a section after the first');
 const previous=spans[sectionIndex-1],current=spans[sectionIndex];
 if(!Number.isInteger(newStartMeasure)||newStartMeasure<=previous.start||newStartMeasure>=current.start+current.measures)
   throw Error('Keep at least one measure in each adjacent section');
 if(newStartMeasure===current.start)return project;
 const bars=project.bars.map((bar,index)=>index>=previous.start&&index<current.start+current.measures
   ?{...bar,section:index<newStartMeasure?previous.label:current.label}:bar);
 return {...project,bars};
}

/** Split at an absolute measure; keep all score and measure-indexed data intact. */
export function insertSectionBoundary(project:Project,measure:number):Project{
 const spans=sectionSpans(project),span=spans.find(s=>measure>s.start&&measure<s.start+s.measures);
 if(!Number.isInteger(measure)||!span)throw Error('Choose a measure inside a section');
 if(spans.length>=26)throw Error('Maximum 26 sections');
 const used=new Set(project.bars.map(b=>b.section));
 const label=Array.from({length:26},(_,i)=>sectionLetter(i)).find(l=>!used.has(l));
 if(!label)throw Error('No unused section label');
 const copy=<T>(map:Record<string,T>|undefined)=>map?{...map,...(Object.prototype.hasOwnProperty.call(map,span.label)?{[label]:JSON.parse(JSON.stringify(map[span.label])) as T}:{})}:undefined;
 return {...project,bars:project.bars.map((bar,i)=>i>=measure&&i<span.start+span.measures?{...bar,section:label}:bar),
 sectionKeys:{...project.sectionKeys,[label]:sectionKey(project,span.label)},
 roles:copy(project.roles)??{},
 pianoFigures:copy(project.pianoFigures),sectionStyles:copy(project.sectionStyles),pianoFigureVariation:copy(project.pianoFigureVariation),
 violinMarcatoBeats:copy(project.violinMarcatoBeats),violinArpeggioDirections:copy(project.violinArpeggioDirections),
 orchestration:project.orchestration?{...project.orchestration,violin:copy(project.orchestration.violin)??{},bandoneon:copy(project.orchestration.bandoneon)??{},contrabass:copy(project.orchestration.contrabass)}:undefined,
 expression:project.expression?{...project.expression,sections:copy(project.expression.sections)??{}}:undefined};
}
export function removeSectionBoundary(project:Project,measure:number):Project{
 const spans=sectionSpans(project),index=spans.findIndex(s=>s.start===measure);
 if(index<=0)throw Error('Choose the start of a section after the first');
 const span=spans[index],previous=spans[index-1];
 return {...project,bars:project.bars.map((bar,i)=>i>=span.start&&i<span.start+span.measures?{...bar,section:previous.label}:bar)};
}
