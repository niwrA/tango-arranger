/** Horizontal window for the continuous Note Editor piano roll. All indices are
 * relative to the selected measure range; end is exclusive. Nothing musical is
 * clipped or changed here -- only the DOM cells that are rendered. */
export const NOTE_GRID_CELL_PX=28;
export const NOTE_GRID_LABEL_PX=64;
export interface NoteGridViewport{
 first:number;
 end:number;
 active:number;
 leftPx:number;
 widthPx:number;
}
export function noteGridViewport(
 totalMeasures:number,stepsPerMeasure:number,scrollLeft:number,viewportWidth:number,overscan=1
):NoteGridViewport{
 const total=Math.max(1,Math.floor(Number.isFinite(totalMeasures)?totalMeasures:1));
 const steps=Math.max(1,Math.floor(Number.isFinite(stepsPerMeasure)?stepsPerMeasure:1));
 const measurePx=steps*NOTE_GRID_CELL_PX;
 const left=Math.max(0,Number.isFinite(scrollLeft)?scrollLeft:0);
 const width=Math.max(1,Number.isFinite(viewportWidth)?viewportWidth:1);
 const buffer=Math.max(0,Math.floor(Number.isFinite(overscan)?overscan:1));
 const firstVisible=Math.min(total-1,Math.floor(Math.max(0,left-NOTE_GRID_LABEL_PX)/measurePx));
 const lastVisible=Math.min(total,Math.max(firstVisible+1,Math.ceil(Math.max(0,left+width-NOTE_GRID_LABEL_PX)/measurePx)));
 const first=Math.max(0,firstVisible-buffer);
 const end=Math.min(total,lastVisible+buffer);
 // Favor the leading third of the viewport; measure 1 remains selected
 // when two measures are visible at startup.
 const focusX=Math.max(0,left+Math.min(width*0.35,measurePx/2)-NOTE_GRID_LABEL_PX);
 const active=Math.min(total-1,Math.floor(focusX/measurePx));
 return {first,end,active,leftPx:first*measurePx,widthPx:(end-first)*measurePx};
}

export function noteGridSpan(note:{start:number;duration:number},fromBeat:number,toBeat:number){
 const start=Math.max(note.start,fromBeat),end=Math.min(note.start+note.duration,toBeat);
 return {left:100*(start-fromBeat)/(toBeat-fromBeat)+'%',width:100*(end-start)/(toBeat-fromBeat)+'%'};
}
