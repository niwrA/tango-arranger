import {retimeMeasure,validateRhythmPattern,type RhythmSlot,type RhythmMode} from './rhythmEditor';
import type {Project,Score,Instrument,Note} from './music';

/** Read-only score comparison. The same retimeMeasure algorithm is used by Apply. */
export type RhythmPreviewRow={
 bar:number;before:Note[];after:Note[];status:'changed'|'unchanged'|'protected'|'silent';
};
export function rhythmPreviewForSelection(
 project:Project,score:Score,instrument:Instrument,measures:readonly number[],
 slots:RhythmSlot[],mode:RhythmMode,overwriteProtected=false
):RhythmPreviewRow[]{
 const valid=validateRhythmPattern(slots,project.beats);
 if(!valid.length)throw Error('Add at least one attack to preview this rhythm.');
 if(!['rhythm','accents'].includes(mode))throw Error('Unknown rhythm mode.');
 const split=project.pianoSplitPitch??60;
 return measures.map(bar=>{
  if(!Number.isInteger(bar)||bar<0||bar>=project.bars.length)throw Error('Invalid preview measure.');
  const start=bar*project.beats,end=start+project.beats;
  const before=(score[instrument]??[]).filter(n=>n.start>=start-1e-7&&n.start<end-1e-7);
  if(!before.length)return {bar,before:[],after:[],status:'silent' as const};
  if(project.protectedBars[instrument+':'+bar]&&!overwriteProtected)
   return {bar,before,after:before,status:'protected' as const};
  const after=retimeMeasure(before,instrument,bar,project.beats,valid,mode,split);
  const signature=(notes:Note[])=>JSON.stringify(notes.map(n=>[n.pitch,n.start,n.duration,n.accent??false,n.articulation??'']));
  return {bar,before,after,status:signature(before)===signature(after)?'unchanged' as const:'changed' as const};
 });
}
export type RhythmAudioEvent={pitch:number;atBeat:number;durationBeats:number;velocity:number};
/** Concatenate selected measures in order, preserving each bar's internal rests. */
export function rhythmPreviewAudioPlan(rows:ReadonlyArray<RhythmPreviewRow>,beats:number,after:boolean):RhythmAudioEvent[]{
 if(!Number.isFinite(beats)||beats<=0)throw Error('Invalid meter.');
 return rows.flatMap((row,index)=>(after?row.after:row.before).map(note=>({
  pitch:note.pitch,atBeat:index*beats+note.start-row.bar*beats,
  durationBeats:note.duration,velocity:note.velocity??80
 }))).filter(e=>e.atBeat>=0&&e.durationBeats>0).sort((a,b)=>a.atBeat-b.atBeat||a.pitch-b.pitch);
}
