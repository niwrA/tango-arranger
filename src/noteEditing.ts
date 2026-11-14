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
