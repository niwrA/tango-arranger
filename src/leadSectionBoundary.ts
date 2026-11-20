import {sectionSpans,type Project} from './music';
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
