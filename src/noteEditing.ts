/** Duration math is independent of the browser so it can be regression-tested. */
export function clampWrittenDuration(localStart:number,requested:number,beats:number):number {
  if(!Number.isFinite(localStart)||!Number.isFinite(requested)||!Number.isFinite(beats)||beats<=0)throw Error('Invalid note timing');
  const available=beats-localStart;
  if(available<0.25-1e-8)throw Error('Note onset leaves no room for a minimum-duration note');
  return Math.max(0.25,Math.min(available,Number(requested.toFixed(4))));
}
/** Convert horizontal movement into snapped beats, using the actual grid cell width. */
export function dragWrittenDuration(initial:number,deltaPixels:number,cellWidth:number,gridStep:number,localStart:number,beats:number):number {
  if(!Number.isFinite(cellWidth)||cellWidth<=0||!Number.isFinite(gridStep)||gridStep<=0)throw Error('Invalid note grid geometry');
  const delta=Math.round(deltaPixels/cellWidth)*gridStep;
  return clampWrittenDuration(localStart,initial+delta,beats);
}

/** Move an entire note in time without changing its duration. The note is kept
 * inside the current measure, and the displacement is snapped to grid steps.
 */
export function dragWrittenNotePosition(initialStart:number,duration:number,deltaPixels:number,cellWidth:number,gridStep:number,beats:number):number {
  validateDragGeometry(cellWidth,gridStep,deltaPixels);
  if(!Number.isFinite(initialStart)||!Number.isFinite(duration)||!Number.isFinite(beats)||duration<0.25||initialStart<0||initialStart+duration>beats+1e-8)throw Error('Invalid note position');
  const shift=Math.round(deltaPixels/cellWidth)*gridStep;
  return Number(Math.max(0,Math.min(beats-duration,initialStart+shift)).toFixed(4));
}
/** Resize from the left edge: move the onset but keep the original end fixed.
 * A minimum of 0.25 beats must remain, and the onset cannot precede the bar.
 */
export function dragWrittenNoteLeftEdge(initialStart:number,initialDuration:number,deltaPixels:number,cellWidth:number,gridStep:number,beats:number):{start:number;duration:number} {
  validateDragGeometry(cellWidth,gridStep,deltaPixels);
  if(!Number.isFinite(initialStart)||!Number.isFinite(initialDuration)||!Number.isFinite(beats)||initialDuration<0.25||initialStart<0||initialStart+initialDuration>beats+1e-8)throw Error('Invalid note endpoints');
  const end=initialStart+initialDuration;
  const shift=Math.round(deltaPixels/cellWidth)*gridStep;
  const start=Number(Math.max(0,Math.min(end-0.25,initialStart+shift)).toFixed(4));
  return {start,duration:Number((end-start).toFixed(4))};
}
function validateDragGeometry(cellWidth:number,gridStep:number,deltaPixels:number):void {
  if(!Number.isFinite(cellWidth)||cellWidth<=0||!Number.isFinite(gridStep)||gridStep<=0||!Number.isFinite(deltaPixels))throw Error('Invalid note grid geometry');
}
